import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conversationRefFromAgent } from '@codex-claw/core/conversation-ref';
import type { Agent, AppSnapshot, BackendConversationRef } from '@codex-claw/core/contracts';
import type {
  DesignDiagram,
  DesignDiagramAsset,
  DesignDiagramContent,
  DesignSession,
} from '@codex-claw/core/design';
import { cloneDesignSession } from '@codex-claw/core/design';
import { createEntityId } from '@codex-claw/core/ids';

const MAX_DIAGRAM_SOURCE_BYTES = 250_000;
const MAX_GENERATED_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DESIGN_DIAGRAMS = 50;

export type DesignSuggestionInput = {
  title: string;
  description: string;
};

export type DesignDiagramInput = {
  title: string;
  suggestionId?: string;
  content:
    | { kind: 'mermaid' | 'svg'; source: string }
    | { kind: 'image'; generatedImagePath: string; alt: string };
};

export type ReplaceDesignDiagramInput = DesignDiagramInput & {
  diagramId: string;
  expectedRevision: number;
};

export type DesignServiceOptions = {
  snapshot: AppSnapshot;
  generatedImagesRoot: string;
  createId?: (prefix: string) => string;
  now?: () => Date;
  persist: () => Promise<void>;
  publish: () => void;
};

export class DesignService {
  private readonly createId: (prefix: string) => string;
  private readonly now: () => Date;

  constructor(private readonly options: DesignServiceOptions) {
    this.createId = options.createId ?? createEntityId;
    this.now = options.now ?? (() => new Date());
  }

  contextForAgent(agentId: string): DesignSession | undefined {
    const agent = this.agent(agentId);
    if (!agent?.design || !this.ownsCurrentConversation(agent, agent.design)) return undefined;
    return agent.design;
  }

  developerInstructionsForAgent(agentId: string): string | undefined {
    const design = this.contextForAgent(agentId);
    if (!design) return undefined;
    const selected = design.diagrams.find(diagram => diagram.id === design.selectedDiagramId);
    return [
      'Codex Claw Design mode is active. Diagrams and suggestions must be published through the Design MCP tools; keep chat secondary.',
      selected
        ? `The user currently has Design diagram "${selected.title}" (${selected.id}, revision ${selected.revision}) selected. Interpret edit requests as targeting it: read it first, then replace it with optimistic revision checking.`
        : 'No Design diagram is selected yet. Use add-design-diagram when the user asks for a new diagram.',
    ].join(' ');
  }

  async enter(agentId: string): Promise<{ created: boolean; design: DesignSession }> {
    const agent = this.requireAgent(agentId);
    const existing = this.contextForAgent(agentId);
    if (existing) return { created: false, design: cloneDesignSession(existing) };

    const timestamp = this.now().toISOString();
    const design: DesignSession = {
      id: this.createId('design'),
      conversationRef: cloneConversationRef(conversationRefFromAgent(agent)),
      suggestions: [],
      diagrams: [],
      selectedDiagramId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    agent.design = design;
    await this.commit();
    return { created: true, design: cloneDesignSession(design) };
  }

  async suggest(agentId: string, suggestions: DesignSuggestionInput[]): Promise<{
    success: true;
    suggestions: DesignSession['suggestions'];
  }> {
    if (suggestions.length < 1 || suggestions.length > 4) {
      throw new Error('Design requires between 1 and 4 diagram suggestions.');
    }
    const { design } = this.requireContext(agentId);
    this.bindConversation(agentId, design);
    design.suggestions = suggestions.map(suggestion => ({
      id: this.createId('design-suggestion'),
      title: boundedText(suggestion.title, 'Suggestion title', 200),
      description: boundedText(suggestion.description, 'Suggestion description', 2_000),
    }));
    design.updatedAt = this.now().toISOString();
    await this.commit();
    return { success: true, suggestions: design.suggestions.map(suggestion => ({ ...suggestion })) };
  }

  async add(agentId: string, input: DesignDiagramInput): Promise<{
    success: true;
    diagramId: string;
    revision: number;
    title: string;
  }> {
    const { design } = this.requireContext(agentId);
    if (design.diagrams.length >= MAX_DESIGN_DIAGRAMS) {
      throw new Error(`Design supports at most ${MAX_DESIGN_DIAGRAMS} diagrams.`);
    }
    this.bindConversation(agentId, design);
    const suggestion = input.suggestionId
      ? design.suggestions.find(candidate => candidate.id === input.suggestionId)
      : undefined;
    if (input.suggestionId && !suggestion) {
      throw new Error(`Design suggestion not found: ${input.suggestionId}`);
    }
    const timestamp = this.now().toISOString();
    const diagram: DesignDiagram = {
      id: this.createId('design-diagram'),
      title: boundedText(input.title, 'Diagram title', 200),
      content: await this.diagramContent(input.content),
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    design.diagrams.push(diagram);
    design.selectedDiagramId = diagram.id;
    if (suggestion) {
      suggestion.diagramId = diagram.id;
    }
    design.updatedAt = timestamp;
    await this.commit();
    return { success: true, diagramId: diagram.id, revision: diagram.revision, title: diagram.title };
  }

  get(agentId: string, diagramId: string): { success: true; diagram: DesignDiagram } {
    const diagram = this.requireDiagram(agentId, diagramId);
    return { success: true, diagram: { ...diagram, content: { ...diagram.content } } };
  }

  async replace(agentId: string, input: ReplaceDesignDiagramInput): Promise<{
    success: true;
    diagramId: string;
    revision: number;
    title: string;
  }> {
    const { design } = this.requireContext(agentId);
    this.bindConversation(agentId, design);
    const index = design.diagrams.findIndex(candidate => candidate.id === input.diagramId);
    const current = design.diagrams[index];
    if (!current) throw new Error(`Design diagram not found: ${input.diagramId}`);
    if (current.revision !== input.expectedRevision) {
      throw new Error(`Design diagram changed. Read revision ${current.revision} before replacing it.`);
    }
    const timestamp = this.now().toISOString();
    const replacement: DesignDiagram = {
      ...current,
      title: boundedText(input.title, 'Diagram title', 200),
      content: await this.diagramContent(input.content),
      revision: current.revision + 1,
      updatedAt: timestamp,
    };
    design.diagrams[index] = replacement;
    design.selectedDiagramId = replacement.id;
    if (input.suggestionId) {
      const suggestion = design.suggestions.find(candidate => candidate.id === input.suggestionId);
      if (!suggestion) throw new Error(`Design suggestion not found: ${input.suggestionId}`);
      suggestion.diagramId = replacement.id;
    }
    design.updatedAt = timestamp;
    await this.commit();
    return {
      success: true,
      diagramId: replacement.id,
      revision: replacement.revision,
      title: replacement.title,
    };
  }

  async select(agentId: string, diagramId: string): Promise<DesignSession> {
    const { design } = this.requireContext(agentId);
    if (!design.diagrams.some(diagram => diagram.id === diagramId)) {
      throw new Error(`Design diagram not found: ${diagramId}`);
    }
    if (design.selectedDiagramId !== diagramId) {
      design.selectedDiagramId = diagramId;
      design.updatedAt = this.now().toISOString();
      await this.commit();
    }
    return cloneDesignSession(design);
  }

  async readAsset(agentId: string, diagramId: string): Promise<DesignDiagramAsset> {
    const diagram = this.requireDiagram(agentId, diagramId);
    if (diagram.content.kind !== 'image') throw new Error('Design diagram is not an image.');
    const resolved = await this.resolveGeneratedImage(diagram.content.assetPath);
    const buffer = await readFile(resolved.absolutePath);
    return {
      diagramId,
      mimeType: diagram.content.mimeType,
      dataUrl: `data:${diagram.content.mimeType};base64,${buffer.toString('base64')}`,
    };
  }

  private requireContext(agentId: string): { agent: Agent; design: DesignSession } {
    const agent = this.requireAgent(agentId);
    const design = this.contextForAgent(agentId);
    if (!design) throw new Error('Design mode is not active for this conversation. Enter it with /design.');
    return { agent, design };
  }

  private requireDiagram(agentId: string, diagramId: string): DesignDiagram {
    const { design } = this.requireContext(agentId);
    const diagram = design.diagrams.find(candidate => candidate.id === diagramId);
    if (!diagram) throw new Error(`Design diagram not found: ${diagramId}`);
    return diagram;
  }

  private agent(agentId: string): Agent | undefined {
    return this.options.snapshot.agents.find(candidate => candidate.id === agentId);
  }

  private requireAgent(agentId: string): Agent {
    const agent = this.agent(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    return agent;
  }

  private ownsCurrentConversation(agent: Agent, design: DesignSession): boolean {
    const current = conversationRefFromAgent(agent);
    return design.conversationRef === null || (current !== null && sameConversation(design.conversationRef, current));
  }

  private bindConversation(agentId: string, design: DesignSession): void {
    if (design.conversationRef) return;
    design.conversationRef = cloneConversationRef(conversationRefFromAgent(this.requireAgent(agentId)));
  }

  private async diagramContent(input: DesignDiagramInput['content']): Promise<DesignDiagramContent> {
    if ('source' in input) {
      return {
        kind: input.kind,
        source: boundedText(input.source, 'Diagram source', MAX_DIAGRAM_SOURCE_BYTES),
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
    if (details.size > MAX_GENERATED_IMAGE_BYTES) throw new Error('Generated image exceeds the 10 MiB Design limit.');
    const mimeType = imageMimeType(target);
    if (!mimeType) throw new Error('Design images must be GIF, JPEG, PNG, or WebP.');
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

export function initialDesignPrompt(userPrompt?: string): string {
  return [
    'Enter Codex Claw Design mode for this conversation.',
    'Review the current conversation and call codex_claw.suggest-design-diagrams exactly once with 1 to 4 diagrams that would materially help the user.',
    'Do not provide the suggestions only as prose. The Design pane is the source of truth.',
    'When asked to generate a suggestion or add a diagram, use Mermaid or SVG, or use image generation and then register its saved path with codex_claw.add-design-diagram.',
    'When asked to edit a diagram, read it with codex_claw.get-design-diagram and publish the replacement with codex_claw.replace-design-diagram.',
    userPrompt?.trim() ? `Use this additional direction when choosing suggestions: ${userPrompt.trim()}` : '',
  ].filter(Boolean).join(' ');
}

export function generateDesignSuggestionPrompt(session: DesignSession, suggestionId: string): string {
  const suggestion = session.suggestions.find(candidate => candidate.id === suggestionId);
  if (!suggestion) throw new Error(`Design suggestion not found: ${suggestionId}`);
  return [
    `Generate the Design suggestion "${suggestion.title}" (${suggestion.id}).`,
    suggestion.description,
    'Choose Mermaid, SVG, or image generation based on what communicates it best.',
    'Publish the finished result with codex_claw.add-design-diagram and pass this suggestion ID. Keep chat commentary brief because the Design pane is the primary output.',
  ].join(' ');
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

function imageMimeType(filePath: string): 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp' | null {
  return ({
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  } as const)[path.extname(filePath).toLowerCase() as '.gif' | '.jpeg' | '.jpg' | '.png' | '.webp'] ?? null;
}
