import {
  getCodexNativeRendererApi,
  type CodexNativeAttachment,
  type CodexComposerState,
  type CodexRendererSendMessageOptions,
} from '@codex-app-sdk/vue';
import type { RendererPromptAttachment, RendererSendPromptOptions } from '@codex-claw/core/contracts';
import { computed, reactive, ref } from 'vue';
import { translate } from '../i18n';
import type { ImageAnnotationSavePayload } from './ImageAnnotationDialog.vue';
import {
  centeredImageCropDataUrl,
  formatImageAnnotationPrompt,
  imageDataUrlArrayBuffer,
  type SavedImageAnnotations,
} from './image-annotation';

type AttachmentAnnotationTarget = {
  agentId: string;
  attachment: CodexNativeAttachment;
};

export function useImageAnnotation(options: {
  composerAttachments: () => readonly CodexNativeAttachment[];
  composerState: () => CodexComposerState;
  currentAgentId: () => string | undefined;
  debugFallbackImageSource: string;
  notifyError: (message: string) => void;
  updateComposerAttachments: (agentId: string, attachments: readonly CodexNativeAttachment[]) => void;
  updateComposerState: (agentId: string, state: CodexComposerState) => void;
}) {
  const draftsByAgentId = reactive<Record<string, Record<string, SavedImageAnnotations>>>({});
  const debugVisible = ref(false);
  const debugPixelRatio = ref<1 | 2>(1);
  const debugImageSource = ref(options.debugFallbackImageSource);
  const target = ref<AttachmentAnnotationTarget | null>(null);

  const visible = computed(() => debugVisible.value || target.value !== null);
  const imageSource = computed(() => target.value?.attachment.previewUrl ?? debugImageSource.value);
  const savedDraft = computed(() => {
    const current = target.value;
    return current ? draftsByAgentId[current.agentId]?.[current.attachment.reference] ?? null : null;
  });
  const initialAnnotations = computed(() => savedDraft.value?.annotations ?? []);
  const pixelRatio = computed<1 | 2>(() => (
    target.value ? savedDraft.value?.pixelRatio ?? 1 : debugPixelRatio.value
  ));
  const fileName = computed(() => {
    const name = target.value?.attachment.name;
    if (!name) return 'codex-claw-annotated.png';
    return `${name.replace(/\.[^.]+$/, '') || 'image'}-annotated.png`;
  });
  const activeCounts = computed<Readonly<Record<string, number>>>(() => {
    const agentId = options.currentAgentId();
    const drafts = agentId ? draftsByAgentId[agentId] ?? {} : {};
    return Object.fromEntries(Object.entries(drafts).map(([reference, draft]) => [reference, draft.annotations.length]));
  });

  function openAttachment(attachment: CodexNativeAttachment): void {
    const agentId = options.currentAgentId();
    if (!agentId || attachment.type !== 'image') return;
    if (!attachment.previewUrl) {
      options.notifyError(translate('surface.appShell.thisImageCannotBeOpenedForAnnotation'));
      return;
    }
    debugVisible.value = false;
    target.value = { agentId, attachment };
  }

  function close(): void {
    debugVisible.value = false;
    target.value = null;
  }

  function handleError(): void {
    if (target.value) {
      options.notifyError(translate('surface.appShell.thisImageCannotBeOpenedForAnnotation'));
      close();
      return;
    }
    void useDebugFallback();
  }

  function save(payload: ImageAnnotationSavePayload): void {
    const current = target.value;
    if (!current) {
      debugVisible.value = false;
      return;
    }
    if (payload.annotations.length === 0) remove(current.agentId, current.attachment.reference);
    else {
      draftsByAgentId[current.agentId] = {
        ...draftsByAgentId[current.agentId],
        [current.attachment.reference]: cloneDraft(payload),
      };
    }
    target.value = null;
  }

  async function openDebug(imageDataUrl?: string, ratio: 1 | 2 = 1): Promise<void> {
    target.value = null;
    if (imageDataUrl) {
      debugImageSource.value = imageDataUrl;
      debugPixelRatio.value = ratio;
      debugVisible.value = true;
      return;
    }
    await useDebugFallback();
    debugVisible.value = true;
  }

  async function forward(
    prompt: string,
    sendOptions: CodexRendererSendMessageOptions | undefined,
    send: (nextPrompt: string, nextOptions?: RendererSendPromptOptions) => void | Promise<void>,
  ): Promise<void> {
    const agentId = options.currentAgentId();
    const savedByReference = agentId ? draftsByAgentId[agentId] ?? {} : {};
    let imageNumber = 0;
    const annotatedImages = options.composerAttachments().flatMap((attachment) => {
      if (attachment.type !== 'image') return [];
      imageNumber += 1;
      const draft = savedByReference[attachment.reference];
      return draft?.annotations.length ? [{ attachment, draft: cloneDraft(draft), imageNumber }] : [];
    });
    if (!agentId || annotatedImages.length === 0) {
      await send(prompt, promptOptions(sendOptions));
      return;
    }
    const nativeApi = getCodexNativeRendererApi();
    if (!nativeApi?.capabilities.attachments) {
      throw new Error(translate('surface.appShell.annotatedImagesCannotBePreparedByThisHost'));
    }
    const composerState = { ...options.composerState() };
    const composerAttachments = options.composerAttachments().map((attachment) => ({ ...attachment }));
    const savedDrafts = Object.fromEntries(
      Object.entries(savedByReference).map(([reference, draft]) => [reference, cloneDraft(draft)]),
    );
    try {
      const ingested = await nativeApi.ingestAttachments(annotatedImages.map(({ draft }) => ({
        name: draft.fileName,
        mimeType: 'image/png',
        data: imageDataUrlArrayBuffer(draft.dataUrl),
      })));
      if (ingested.length !== annotatedImages.length) {
        throw new Error(translate('surface.appShell.oneOrMoreAnnotatedImagesCouldNotBePrepared'));
      }
      const replacements = new Map(annotatedImages.map(({ attachment }, index) => [
        attachment.reference,
        ingested[index]!.reference,
      ]));
      const submittedAttachments = sendOptions?.attachments ?? composerAttachments.map((attachment) => ({
        type: attachment.type,
        reference: attachment.reference,
      }));
      const nextOptions: CodexRendererSendMessageOptions = {
        ...sendOptions,
        attachments: submittedAttachments.map((attachment) => ({
          ...attachment,
          reference: replacements.get(attachment.reference) ?? attachment.reference,
        })),
      };
      await send(formatImageAnnotationPrompt(annotatedImages.map(({ attachment, draft, imageNumber: number }) => ({
        annotations: draft.annotations,
        fileName: attachment.name,
        imageNumber: number,
      })), prompt), promptOptions(nextOptions));
    } catch (error) {
      draftsByAgentId[agentId] = savedDrafts;
      options.updateComposerState(agentId, composerState);
      options.updateComposerAttachments(agentId, composerAttachments);
      throw error;
    }
  }

  function prune(agentId: string, attachments: readonly CodexNativeAttachment[]): void {
    const existing = draftsByAgentId[agentId];
    if (!existing) return;
    const references = new Set(attachments.map((attachment) => attachment.reference));
    draftsByAgentId[agentId] = Object.fromEntries(
      Object.entries(existing).filter(([reference]) => references.has(reference)),
    );
  }

  function remove(agentId: string, reference: string): void {
    const existing = draftsByAgentId[agentId];
    if (!existing?.[reference]) return;
    const next = { ...existing };
    delete next[reference];
    draftsByAgentId[agentId] = next;
  }

  async function useDebugFallback(): Promise<void> {
    debugPixelRatio.value = 1;
    try {
      debugImageSource.value = await centeredImageCropDataUrl(options.debugFallbackImageSource);
    } catch {
      debugImageSource.value = options.debugFallbackImageSource;
    }
  }

  return {
    activeCounts,
    close,
    fileName,
    forward,
    handleError,
    imageSource,
    initialAnnotations,
    openAttachment,
    openDebug,
    pixelRatio,
    prune,
    remove,
    save,
    target,
    visible,
  };
}

function cloneDraft(draft: SavedImageAnnotations): SavedImageAnnotations {
  return {
    ...draft,
    annotations: draft.annotations.map((annotation) => ({
      ...annotation,
      start: { ...annotation.start },
      end: { ...annotation.end },
    })),
  };
}

function promptOptions(options?: CodexRendererSendMessageOptions): RendererSendPromptOptions | undefined {
  const attachments = options?.attachments?.map<RendererPromptAttachment>((attachment) => ({ ...attachment }));
  if (!attachments?.length && !options?.inputMethod) return undefined;
  return {
    ...(attachments?.length ? { attachments } : {}),
    ...(options?.inputMethod ? { inputMethod: options.inputMethod } : {}),
  };
}
