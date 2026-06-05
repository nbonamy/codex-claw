import { getMessageToolCallArgs, getMessageToolCallName, type Message, type MessageMedia, type MessageToolCall, type MessagePart } from './types'

export type MessageBlock =
  | { type: 'text'; content: string }
  | { type: 'user-text'; content: string }
  | { type: 'mermaid'; code: string }
  | { type: 'media'; media: MessageMedia; toolCall?: MessageToolCall }
  | { type: 'tool'; toolCall: MessageToolCall }
  | { type: 'tool-group'; toolCalls: MessageToolCall[] }
  | { type: 'follow-ups'; prompts: string[] }

type CodeBlockRange = {
  start: number
  end: number
}

const toolTagRegex = /<tool\s+(id|index)="([^"]*)"><\/tool>/g
const markdownImageRegex = /(?<!\[)!\[([^\]]*)\]\(([^)\s]+)(?:\s+["']([^"']*)["'])?\)/g
const contextTagRegex = /<context>[\s\S]*?<\/context>\s*/g
const followUpTagRegex = /<follow-up>([\s\S]*?)<\/follow-up>/g
const ungroupedToolNames = new Set([
  'ask_user_question',
])

export function computeMessageBlocks(message: Message): MessageBlock[] {
  if (message.role !== 'assistant') {
    if (!message.content) {
      return []
    }
    return [{ type: 'user-text', content: stripMessageContext(message.content) }]
  }

  const toolCalls = message.toolCalls ?? []
  const parts = message.parts ?? []
  if (!message.content && toolCalls.length === 0 && parts.length === 0) {
    return []
  }

  if (parts.length > 0) {
    return computeMessageBlocksFromParts(parts, toolCalls)
  }

  const anchoredToolCallIds = new Set<string>()
  const { blocks, prompts } = parseTextBlocks(message.content, toolCalls, anchoredToolCallIds)

  appendUnanchoredTools(blocks, toolCalls, anchoredToolCallIds)
  return finalizeAssistantBlocks(blocks, prompts)
}

function computeMessageBlocksFromParts(parts: MessagePart[], toolCalls: MessageToolCall[]): MessageBlock[] {
  const blocks: MessageBlock[] = []
  const prompts: string[] = []
  const anchoredToolCallIds = new Set<string>()

  for (const part of parts) {
    if (part.type === 'tool') {
      anchoredToolCallIds.add(part.toolCall.id)
      blocks.push({ type: 'tool', toolCall: part.toolCall })
      continue
    }

    const parsed = parseTextBlocks(part.content, toolCalls, anchoredToolCallIds)
    blocks.push(...parsed.blocks)
    prompts.push(...parsed.prompts)
  }

  appendUnanchoredTools(blocks, toolCalls, anchoredToolCallIds)
  return finalizeAssistantBlocks(blocks, prompts)
}

function parseTextBlocks(rawContent: string, toolCalls: MessageToolCall[], anchoredToolCallIds: Set<string>) {
  const { content, prompts } = extractFollowUps(completeStreamingCustomTags(rawContent))
  const codeBlocks = findCodeBlocks(content)
  const blocks: MessageBlock[] = []
  addReferencedToolCallIds(content, toolCalls, anchoredToolCallIds)
  let lastIndex = 0

  for (const item of findSpecialBlocks(content, codeBlocks)) {
    if (item.start > lastIndex) {
      pushTextBlock(blocks, content.slice(lastIndex, item.start))
    }

    if (item.type === 'mermaid') {
      blocks.push({ type: 'mermaid', code: item.code })
    } else if (item.type === 'tool') {
      const toolCall = findToolCall(item.kind, item.value, toolCalls)
      if (toolCall) {
        anchoredToolCallIds.add(toolCall.id)
        blocks.push({ type: 'tool', toolCall })
      }
    } else {
      const toolCall = findMediaToolCall(item.media, toolCalls)
      if (toolCall) {
        anchoredToolCallIds.add(toolCall.id)
      }
      blocks.push({
        type: 'media',
        media: {
          ...item.media,
          prompt: item.media.prompt ?? getToolCallPrompt(toolCall),
        },
        toolCall
      })
    }

    lastIndex = item.end
  }

  if (lastIndex < content.length) {
    pushTextBlock(blocks, content.slice(lastIndex))
  }

  return { blocks, prompts }
}

function appendUnanchoredTools(blocks: MessageBlock[], toolCalls: MessageToolCall[], anchoredToolCallIds: Set<string>) {
  for (const toolCall of toolCalls) {
    if (!anchoredToolCallIds.has(toolCall.id)) {
      blocks.push({ type: 'tool', toolCall })
    }
  }
}

function finalizeAssistantBlocks(blocks: MessageBlock[], prompts: string[]): MessageBlock[] {
  const grouped = groupToolBlocks(blocks)
  if (prompts.length > 0) {
    grouped.push({ type: 'follow-ups', prompts })
  }

  return grouped
}

export function stripMessageContext(content: string) {
  return content.replace(contextTagRegex, '').trimStart()
}

export function groupToolBlocks(blocks: MessageBlock[]): MessageBlock[] {
  const result: MessageBlock[] = []
  let toolGroup: MessageToolCall[] = []

  const flushGroup = () => {
    if (toolGroup.length === 0) {
      return
    }

    result.push({ type: 'tool-group', toolCalls: [...toolGroup] })
    toolGroup = []
  }

  for (const block of blocks) {
    if (block.type === 'tool') {
      if (isUngroupedTool(block.toolCall)) {
        flushGroup()
        result.push(block)
        continue
      }

      toolGroup.push(block.toolCall)
      continue
    }

    flushGroup()
    result.push(block)
  }

  flushGroup()
  return result
}

function isUngroupedTool(toolCall: MessageToolCall) {
  if (ungroupedToolNames.has(getMessageToolCallName(toolCall))) {
    return true
  }

  const status = parseToolStatus(toolCall.status)
  return (status?.source === 'mcp' || status?.source === 'home') &&
    typeof status.params?.requestId === 'string' &&
    toolCall.state === 'running'
}

function parseToolStatus(status: unknown) {
  if (typeof status !== 'string' || !status.startsWith('{')) {
    return undefined
  }

  try {
    return JSON.parse(status) as {
      action?: unknown
      params?: Record<string, unknown>
      source?: unknown
    }
  } catch {
    return undefined
  }
}

function pushTextBlock(blocks: MessageBlock[], content: string) {
  if (content.trim()) {
    blocks.push({ type: 'text', content })
  }
}

function extractFollowUps(content: string) {
  const prompts: string[] = []
  const stripped = content.replace(followUpTagRegex, (_match, prompt: string) => {
    const trimmed = prompt.trim()
    if (trimmed) {
      prompts.push(trimmed)
    }
    return ''
  })

  return { content: stripped, prompts }
}

function completeStreamingCustomTags(content: string) {
  return completeStreamingToolTag(completeStreamingPairedTag(content, 'follow-up'))
}

function completeStreamingPairedTag(content: string, tagName: string) {
  const openTag = `<${tagName}>`
  const closeTag = `</${tagName}>`
  const openIndex = content.lastIndexOf(openTag)
  const closeIndex = content.lastIndexOf(closeTag)
  if (openIndex <= closeIndex) {
    return content
  }

  const partialCloseIndex = content.lastIndexOf('</')
  if (partialCloseIndex > openIndex && closeTag.startsWith(content.slice(partialCloseIndex))) {
    return `${content.slice(0, partialCloseIndex)}${closeTag}`
  }

  return `${content}${closeTag}`
}

function completeStreamingToolTag(content: string) {
  const openIndex = content.lastIndexOf('<tool')
  const closeIndex = content.lastIndexOf('</tool>')
  if (openIndex <= closeIndex) {
    return content
  }

  const beforeTool = content.slice(0, openIndex)
  const toolText = content.slice(openIndex)
  const closeTag = '</tool>'
  const partialCloseIndex = toolText.lastIndexOf('</')
  const openingText = partialCloseIndex >= 0 ? toolText.slice(0, partialCloseIndex) : toolText
  const partialClose = partialCloseIndex >= 0 ? toolText.slice(partialCloseIndex) : ''
  const openingEnd = openingText.indexOf('>')

  if (openingEnd === -1) {
    const attributeMatch = openingText.match(/^<tool\s+(id|index)="([^"]*)"$/)
    return attributeMatch ? `${beforeTool}${openingText}>${closeTag}` : beforeTool
  }

  const completedOpening = openingText.slice(0, openingEnd + 1)
  const trailingText = openingText.slice(openingEnd + 1)
  if (partialClose && closeTag.startsWith(partialClose)) {
    return `${beforeTool}${completedOpening}${closeTag}${trailingText}`
  }

  return `${beforeTool}${completedOpening}${closeTag}${trailingText}`
}

function findToolCall(kind: string, value: string, toolCalls: MessageToolCall[]) {
  if (kind === 'id') {
    return toolCalls.find((toolCall) => toolCall.id === value)
  }

  if (kind === 'index') {
    return toolCalls[Number.parseInt(value, 10)]
  }

  return undefined
}

function addReferencedToolCallIds(content: string, toolCalls: MessageToolCall[], ids: Set<string>) {
  for (const match of content.matchAll(toolTagRegex)) {
    const toolCall = findToolCall(match[1], match[2], toolCalls)
    if (toolCall) {
      ids.add(toolCall.id)
    }
  }
}

function findMediaToolCall(media: MessageMedia, toolCalls: MessageToolCall[]) {
  return toolCalls.find((toolCall) => {
    if (getMessageToolCallName(toolCall) !== 'image_generation') {
      return false
    }

    const resultUrl = getToolCallResultString(toolCall, 'url')
    const resultExternalUrl = getToolCallResultString(toolCall, 'externalUrl')
    const resultPath = getToolCallResultString(toolCall, 'path')
    return media.url === resultUrl || media.url === resultExternalUrl || media.url === resultPath
  })
}

function getToolCallPrompt(toolCall?: MessageToolCall) {
  return getToolCallResultString(toolCall, 'prompt') ?? getToolCallParamString(toolCall, 'prompt')
}

function getToolCallResultString(toolCall: MessageToolCall | undefined, key: string) {
  const result = toolCall?.result
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return undefined
  }

  const value = (result as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getToolCallParamString(toolCall: MessageToolCall | undefined, key: string) {
  const params = toolCall ? getMessageToolCallArgs(toolCall) : undefined
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return undefined
  }

  const value = (params as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

type SpecialBlock =
  | { type: 'tool'; start: number; end: number; kind: string; value: string }
  | { type: 'mermaid'; start: number; end: number; code: string }
  | { type: 'media'; start: number; end: number; media: MessageMedia }

function findSpecialBlocks(content: string, codeBlocks: CodeBlockRange[]) {
  const blocks: SpecialBlock[] = []

  for (const block of findMermaidCodeBlocks(content)) {
    blocks.push(block)
  }

  for (const match of content.matchAll(toolTagRegex)) {
    const start = match.index ?? 0
    if (isInsideCodeBlock(start, codeBlocks)) {
      continue
    }

    blocks.push({
      end: start + match[0].length,
      kind: match[1],
      start,
      type: 'tool',
      value: match[2]
    })
  }

  for (const match of content.matchAll(markdownImageRegex)) {
    const start = match.index ?? 0
    if (isInsideCodeBlock(start, codeBlocks)) {
      continue
    }

    const alt = match[1].trim()
    const title = match[3]?.trim()
    blocks.push({
      end: start + match[0].length,
      media: {
        alt: alt || undefined,
        title: title || alt || undefined,
        url: match[2]
      },
      start,
      type: 'media'
    })
  }

  return blocks.sort((first, second) => first.start - second.start)
}

function findMermaidCodeBlocks(content: string): SpecialBlock[] {
  const blocks: SpecialBlock[] = []
  const fenceRegex = /(^|\n)(```|~~~)[ \t]*mermaid[^\n]*\n/gi
  let match: RegExpExecArray | null

  while ((match = fenceRegex.exec(content)) !== null) {
    const fence = match[2]
    const start = match.index + match[1].length
    const codeStart = start + match[0].length - match[1].length
    const closeRegex = new RegExp(`(^|\\n)${escapeRegex(fence)}[ \\t]*(?=\\n|$)`, 'g')
    closeRegex.lastIndex = codeStart
    const close = closeRegex.exec(content)

    if (!close) {
      continue
    }

    const codeEnd = close.index
    const end = close.index + close[0].length
    const code = content.slice(codeStart, codeEnd).trim()
    if (code) {
      blocks.push({ code, end, start, type: 'mermaid' })
    }
    fenceRegex.lastIndex = end
  }

  return blocks
}

function findCodeBlocks(content: string): CodeBlockRange[] {
  const ranges: CodeBlockRange[] = []
  const fenceRegex = /(^|\n)(```|~~~)/g
  let match: RegExpExecArray | null

  while ((match = fenceRegex.exec(content)) !== null) {
    const fence = match[2]
    const start = match.index + match[1].length
    const closeRegex = new RegExp(`(^|\\n)${escapeRegex(fence)}`, 'g')
    closeRegex.lastIndex = start + fence.length
    const close = closeRegex.exec(content)

    if (!close) {
      ranges.push({ start, end: content.length })
      break
    }

    const end = close.index + close[1].length + fence.length
    ranges.push({ start, end })
    fenceRegex.lastIndex = end
  }

  return ranges
}

function isInsideCodeBlock(index: number, ranges: CodeBlockRange[]) {
  return ranges.some((range) => index >= range.start && index <= range.end)
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
