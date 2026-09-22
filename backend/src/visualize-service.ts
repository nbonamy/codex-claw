import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conversationRefFromAgent } from '@codex-claw/core/conversation-ref';
import type { Agent, AppSnapshot, BackendConversationRef } from '@codex-claw/core/contracts';
import type {
  Visualization,
  VisualizationAsset,
  VisualizationContent,
  VisualizeSession,
} from '@codex-claw/core/visualize';
import { cloneVisualizeSession, visualizationSuggestionLimits } from '@codex-claw/core/visualize';
import { createEntityId } from '@codex-claw/core/ids';

const MAX_VISUALIZATION_SOURCE_BYTES = 250_000;
const MAX_GENERATED_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VISUALIZATIONS = 50;
const SUPPORTED_MERMAID_GUIDANCE = 'For Mermaid, use only flowchart, state, sequence, class, ER, or XY diagrams; use SVG for other visualization types.';

export type VisualizationSuggestionInput = {
  title: string;
  description: string;
};

export type VisualizationInput = {
  title: string;
  suggestionId?: string;
  content:
    | { kind: 'mermaid' | 'svg'; source: string }
    | { kind: 'image'; generatedImagePath: string; alt: string };
};

export type ReplaceVisualizationInput = VisualizationInput & {
  visualizationId: string;
};

export type VisualizeServiceOptions = {
  snapshot: AppSnapshot;
  generatedImagesRoot: string;
  createId?: (prefix: string) => string;
  now?: () => Date;
  persist: () => Promise<void>;
  publish: () => void;
};

export class VisualizeService {
  private readonly createId: (prefix: string) => string;
  private readonly now: () => Date;

  constructor(private readonly options: VisualizeServiceOptions) {
    this.createId = options.createId ?? createEntityId;
    this.now = options.now ?? (() => new Date());
  }

  contextForAgent(agentId: string): VisualizeSession | undefined {
    const visualize = this.sessionForAgent(agentId);
    return visualize?.isOpen ? visualize : undefined;
  }

  private sessionForAgent(agentId: string): VisualizeSession | undefined {
    const agent = this.agent(agentId);
    if (!agent?.visualize || !this.ownsCurrentConversation(agent, agent.visualize)) return undefined;
    return agent.visualize;
  }

  developerInstructions(): string {
    return [
      'Codex Claw may expose contextual Visualize MCP tools for the current conversation.',
      'When those tools are available, Visualize mode is active: publish diagrams and suggestions through them and keep chat secondary.',
      'Use list-visualizations to discover the current selection and get-visualization before replacing an existing visualization. Use add-visualization when the user asks for a new one.',
      SUPPORTED_MERMAID_GUIDANCE,
      'Use the current conversation and existing visualizations as the source of truth. Do not browse, search the repository, inspect files, run commands, or do background research unless the user explicitly asks for outside evidence.',
      'When the Visualize tools are unavailable, handle the conversation normally and do not claim that Visualize mode is active.',
    ].join(' ');
  }

  async enter(agentId: string): Promise<{ created: boolean; visualize: VisualizeSession }> {
    const agent = this.requireAgent(agentId);
    const existing = this.sessionForAgent(agentId);
    if (existing) {
      const shouldSuggest = !existing.isOpen && existing.visualizations.length === 0;
      if (!existing.isOpen) {
        existing.isOpen = true;
        if (shouldSuggest) existing.suggestions = [];
        existing.updatedAt = this.now().toISOString();
        await this.commit();
      }
      return { created: shouldSuggest, visualize: cloneVisualizeSession(existing) };
    }

    const timestamp = this.now().toISOString();
    const visualize: VisualizeSession = {
      id: this.createId('visualize'),
      conversationRef: cloneConversationRef(conversationRefFromAgent(agent)),
      isOpen: true,
      suggestions: [],
      visualizations: [],
      selectedVisualizationId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    agent.visualize = visualize;
    await this.commit();
    return { created: true, visualize: cloneVisualizeSession(visualize) };
  }

  async setOpen(agentId: string, open: boolean): Promise<VisualizeSession> {
    const visualize = this.sessionForAgent(agentId);
    if (!visualize) throw new Error('Visualize mode is not available for this conversation.');
    if (visualize.isOpen !== open) {
      visualize.isOpen = open;
      visualize.updatedAt = this.now().toISOString();
      await this.commit();
    }
    return cloneVisualizeSession(visualize);
  }

  async suggest(agentId: string, suggestions: VisualizationSuggestionInput[]): Promise<{
    success: true;
    suggestions: VisualizeSession['suggestions'];
  }> {
    if (suggestions.length < 1 || suggestions.length > 4) {
      throw new Error('Visualize requires between 1 and 4 visualization suggestions.');
    }
    const { visualize } = this.requireContext(agentId);
    this.bindConversation(agentId, visualize);
    visualize.suggestions = suggestions.map(suggestion => ({
      id: this.createId('visualize-suggestion'),
      title: boundedCharacters(compactText(suggestion.title), 'Suggestion title', visualizationSuggestionLimits.title),
      description: boundedCharacters(compactText(suggestion.description), 'Suggestion description', visualizationSuggestionLimits.description),
    }));
    visualize.updatedAt = this.now().toISOString();
    await this.commit();
    return { success: true, suggestions: visualize.suggestions.map(suggestion => ({ ...suggestion })) };
  }

  async add(agentId: string, input: VisualizationInput): Promise<{
    success: true;
    visualizationId: string;
    title: string;
  }> {
    const { visualize } = this.requireContext(agentId);
    if (visualize.visualizations.length >= MAX_VISUALIZATIONS) {
      throw new Error(`Visualize supports at most ${MAX_VISUALIZATIONS} visualizations.`);
    }
    this.bindConversation(agentId, visualize);
    const suggestion = input.suggestionId
      ? visualize.suggestions.find(candidate => candidate.id === input.suggestionId)
      : undefined;
    if (input.suggestionId && !suggestion) {
      throw new Error(`Visualize suggestion not found: ${input.suggestionId}`);
    }
    if (suggestion?.visualizationId) {
      throw new Error(`Visualize suggestion already generated: ${input.suggestionId}`);
    }
    const timestamp = this.now().toISOString();
    const visualization: Visualization = {
      id: this.createId('visualization'),
      title: boundedText(input.title, 'Visualization title', 200),
      content: await this.visualizationContent(input.content),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    visualize.visualizations.push(visualization);
    visualize.selectedVisualizationId = visualization.id;
    if (suggestion) {
      suggestion.visualizationId = visualization.id;
    }
    visualize.updatedAt = timestamp;
    await this.commit();
    return { success: true, visualizationId: visualization.id, title: visualization.title };
  }

  get(agentId: string, visualizationId: string): { success: true; visualization: Visualization } {
    const visualization = this.requireVisualization(agentId, visualizationId);
    return { success: true, visualization: { ...visualization, content: { ...visualization.content } } };
  }

  list(agentId: string): {
    success: true;
    visualizations: Array<Pick<Visualization, 'id' | 'title'> & { kind: Visualization['content']['kind']; selected: boolean }>;
  } {
    const { visualize } = this.requireContext(agentId);
    return {
      success: true,
      visualizations: visualize.visualizations.map(visualization => ({
        id: visualization.id,
        title: visualization.title,
        kind: visualization.content.kind,
        selected: visualization.id === visualize.selectedVisualizationId,
      })),
    };
  }

  async delete(agentId: string, visualizationId: string): Promise<{
    success: true;
    visualizationId: string;
    selectedVisualizationId: string | null;
  }> {
    const { visualize } = this.requireContext(agentId);
    const index = visualize.visualizations.findIndex(visualization => visualization.id === visualizationId);
    if (index === -1) throw new Error(`Visualization not found: ${visualizationId}`);
    visualize.visualizations.splice(index, 1);
    for (const suggestion of visualize.suggestions) {
      if (suggestion.visualizationId === visualizationId) delete suggestion.visualizationId;
    }
    if (visualize.selectedVisualizationId === visualizationId) {
      visualize.selectedVisualizationId = visualize.visualizations[Math.min(index, visualize.visualizations.length - 1)]?.id ?? null;
    }
    visualize.updatedAt = this.now().toISOString();
    await this.commit();
    return { success: true, visualizationId, selectedVisualizationId: visualize.selectedVisualizationId };
  }

  async replace(agentId: string, input: ReplaceVisualizationInput): Promise<{
    success: true;
    visualizationId: string;
    title: string;
  }> {
    const { visualize } = this.requireContext(agentId);
    this.bindConversation(agentId, visualize);
    const index = visualize.visualizations.findIndex(candidate => candidate.id === input.visualizationId);
    const current = visualize.visualizations[index];
    if (!current) throw new Error(`Visualization not found: ${input.visualizationId}`);
    const suggestion = input.suggestionId
      ? visualize.suggestions.find(candidate => candidate.id === input.suggestionId)
      : undefined;
    if (input.suggestionId && !suggestion) {
      throw new Error(`Visualize suggestion not found: ${input.suggestionId}`);
    }
    const timestamp = this.now().toISOString();
    const replacement: Visualization = {
      ...current,
      title: boundedText(input.title, 'Visualization title', 200),
      content: await this.visualizationContent(input.content),
      updatedAt: timestamp,
    };
    visualize.visualizations[index] = replacement;
    visualize.selectedVisualizationId = replacement.id;
    if (suggestion) {
      suggestion.visualizationId = replacement.id;
    }
    visualize.updatedAt = timestamp;
    await this.commit();
    return {
      success: true,
      visualizationId: replacement.id,
      title: replacement.title,
    };
  }

  async select(agentId: string, visualizationId: string): Promise<VisualizeSession> {
    const { visualize } = this.requireContext(agentId);
    if (!visualize.visualizations.some(visualization => visualization.id === visualizationId)) {
      throw new Error(`Visualization not found: ${visualizationId}`);
    }
    if (visualize.selectedVisualizationId !== visualizationId) {
      visualize.selectedVisualizationId = visualizationId;
      visualize.updatedAt = this.now().toISOString();
      await this.commit();
    }
    return cloneVisualizeSession(visualize);
  }

  async readAsset(agentId: string, visualizationId: string): Promise<VisualizationAsset> {
    const visualization = this.requireVisualization(agentId, visualizationId);
    if (visualization.content.kind !== 'image') throw new Error('Visualization is not an image.');
    const resolved = await this.resolveGeneratedImage(visualization.content.assetPath);
    const buffer = await readFile(resolved.absolutePath);
    return {
      visualizationId,
      mimeType: visualization.content.mimeType,
      dataUrl: `data:${visualization.content.mimeType};base64,${buffer.toString('base64')}`,
    };
  }

  private requireContext(agentId: string): { agent: Agent; visualize: VisualizeSession } {
    const agent = this.requireAgent(agentId);
    const visualize = this.contextForAgent(agentId);
    if (!visualize) throw new Error('Visualize mode is not active for this conversation. Enter it with /visualize.');
    return { agent, visualize };
  }

  private requireVisualization(agentId: string, visualizationId: string): Visualization {
    const { visualize } = this.requireContext(agentId);
    const visualization = visualize.visualizations.find(candidate => candidate.id === visualizationId);
    if (!visualization) throw new Error(`Visualization not found: ${visualizationId}`);
    return visualization;
  }

  private agent(agentId: string): Agent | undefined {
    return this.options.snapshot.agents.find(candidate => candidate.id === agentId);
  }

  private requireAgent(agentId: string): Agent {
    const agent = this.agent(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    return agent;
  }

  private ownsCurrentConversation(agent: Agent, visualize: VisualizeSession): boolean {
    const current = conversationRefFromAgent(agent);
    return visualize.conversationRef === null || (current !== null && sameConversation(visualize.conversationRef, current));
  }

  private bindConversation(agentId: string, visualize: VisualizeSession): void {
    if (visualize.conversationRef) return;
    visualize.conversationRef = cloneConversationRef(conversationRefFromAgent(this.requireAgent(agentId)));
  }

  private async visualizationContent(input: VisualizationInput['content']): Promise<VisualizationContent> {
    if ('source' in input) {
      if (input.kind === 'mermaid') assertSupportedMermaid(input.source);
      return {
        kind: input.kind,
        source: boundedText(input.source, 'Visualization source', MAX_VISUALIZATION_SOURCE_BYTES),
      };
    }
    const resolved = await this.resolveGeneratedImage(input.generatedImagePath);
    return {
      kind: 'image',
      assetPath: resolved.relativePath,
      mimeType: resolved.mimeType,
      alt: boundedText(input.alt, 'Image alt text', 500),
    };
  }

  private async resolveGeneratedImage(inputPath: string): Promise<{
    absolutePath: string;
    relativePath: string;
    mimeType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp';
  }> {
    const rawPath = boundedText(inputPath, 'Generated image path', 4_096);
    const candidatePath = rawPath.startsWith('file:') ? fileURLToPath(rawPath) : rawPath;
    const root = await realpath(this.options.generatedImagesRoot);
    const target = await realpath(path.isAbsolute(candidatePath) ? candidatePath : path.join(root, candidatePath));
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Generated image must be inside the Codex Claw generated-images folder.');
    }
    const details = await stat(target);
    if (!details.isFile()) throw new Error('Generated image path is not a file.');
    if (details.size > MAX_GENERATED_IMAGE_BYTES) throw new Error('Generated image exceeds the 10 MiB Visualize limit.');
    const mimeType = imageMimeType(target);
    if (!mimeType) throw new Error('Visualize images must be GIF, JPEG, PNG, or WebP.');
    return {
      absolutePath: target,
      relativePath: relative.split(path.sep).join('/'),
      mimeType,
    };
  }

  private async commit(): Promise<void> {
    await this.options.persist();
    this.options.publish();
  }
}

export function initialVisualizePrompt(): string {
  const instructions = [
    'Enter Codex Claw Visualize mode for this conversation.',
    'Review the current conversation and call codex_claw.suggest-visualizations exactly once with 1 to 4 visualizations that would materially help the user.',
    `Keep every title under ${visualizationSuggestionLimits.title} characters and every description to one short sentence under ${visualizationSuggestionLimits.description} characters.`,
    'Use only the current conversation and existing Visualize context. Do not browse, search the repository, inspect files, run commands, or do background research to choose suggestions.',
    'Do not provide the suggestions only as prose. The Visualize pane is the source of truth.',
    'When asked to generate a suggestion or add a visualization, use Mermaid or SVG, or use image generation and then register its saved path with codex_claw.add-visualization.',
    SUPPORTED_MERMAID_GUIDANCE,
    'When asked to edit a visualization, read it with codex_claw.get-visualization and publish the replacement with codex_claw.replace-visualization.',
  ].join(' ');
  return injectedPrompt('Suggest useful visualizations for this conversation.', instructions);
}

export function directVisualizationPrompt(direction: string): string {
  const instructions = [
    `Create one visualization for this request: ${contextJson(direction)}.`,
    'Use the current conversation and request as the source of truth. Do not browse, search the repository, inspect files, run commands, or do background research; make the best visualization the existing context supports.',
    'Do not suggest visualizations first and do not call codex_claw.suggest-visualizations.',
    'Choose Mermaid, SVG, or image generation based on what communicates it best.',
    SUPPORTED_MERMAID_GUIDANCE,
    'Publish the finished result with codex_claw.add-visualization without a suggestion ID. Keep chat commentary brief because the Visualize pane is the primary output.',
  ].join(' ');
  return injectedPrompt(`Visualize ${direction}.`, instructions);
}

export function generateVisualizationSuggestionPrompt(session: VisualizeSession, suggestionId: string): string {
  const suggestion = session.suggestions.find(candidate => candidate.id === suggestionId);
  if (!suggestion) throw new Error(`Visualize suggestion not found: ${suggestionId}`);
  if (suggestion.visualizationId) throw new Error(`Visualize suggestion already generated: ${suggestionId}`);
  const instructions = [
    `Generate this Visualize suggestion: ${contextJson({ id: suggestion.id, title: suggestion.title, description: suggestion.description })}.`,
    'Use the current conversation and suggestion as the source of truth. Do not browse, search the repository, inspect files, run commands, or do background research; make the best visualization the existing context supports.',
    'Choose Mermaid, SVG, or image generation based on what communicates it best.',
    SUPPORTED_MERMAID_GUIDANCE,
    'Publish the finished result with codex_claw.add-visualization and pass this suggestion ID. Keep chat commentary brief because the Visualize pane is the primary output.',
  ].join(' ');
  return injectedPrompt(`Generate the “${suggestion.title}” visualization.`, instructions);
}

function injectedPrompt(message: string, instructions: string): string {
  return `${message}\n\n<context>\n${instructions}\n</context>`;
}

function contextJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
}

function assertSupportedMermaid(source: string): void {
  const header = source.trimStart().split(/[\n;]/u, 1)[0]?.trim() ?? '';
  if (
    /^(?:graph|flowchart)\s+(?:TD|TB|LR|BT|RL)$/iu.test(header)
    || /^stateDiagram(?:-v2)?$/iu.test(header)
    || /^(?:sequenceDiagram|classDiagram|erDiagram)$/iu.test(header)
    || /^xychart(?:-beta)?\b/iu.test(header)
  ) return;
  throw new Error('Mermaid visualizations support only flowchart, state, sequence, class, ER, and XY diagrams. Use SVG for other visualization types.');
}

function compactText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function cloneConversationRef(ref: BackendConversationRef | null): BackendConversationRef | null {
  return ref ? { ...ref } : null;
}

function sameConversation(left: BackendConversationRef, right: BackendConversationRef): boolean {
  return left.backend === 'codex' && right.backend === 'codex'
    ? left.threadId === right.threadId
    : left.backend === 'claude' && right.backend === 'claude'
      ? left.folder === right.folder && left.sessionId === right.sessionId
      : false;
}

function boundedText(value: string, label: string, maxBytes: number): string {
  const normalized = value.trim();
  const length = Buffer.byteLength(normalized, 'utf8');
  if (!normalized || length > maxBytes) {
    throw new Error(`${label} must contain between 1 and ${maxBytes.toLocaleString('en-US')} bytes.`);
  }
  return normalized;
}

function boundedCharacters(value: string, label: string, maxCharacters: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxCharacters) {
    throw new Error(`${label} must contain between 1 and ${maxCharacters.toLocaleString('en-US')} characters.`);
  }
  return normalized;
}

function imageMimeType(filePath: string): 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp' | null {
  return ({
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  } as const)[path.extname(filePath).toLowerCase() as '.gif' | '.jpeg' | '.jpg' | '.png' | '.webp'] ?? null;
}
