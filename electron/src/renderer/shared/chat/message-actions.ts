import { renderMarkdown } from './message-markdown'

const toolTagRegex = /<tool\s+(id|index)="[^"]*"><\/tool>/g
const followUpTagRegex = /<follow-up>[\s\S]*?<\/follow-up>/g
const breakTagRegex = /<br\s*\/?>/gi

export function stripMessageMarkup(content: string) {
  return content
    .replace(toolTagRegex, '')
    .replace(followUpTagRegex, '')
    .trim()
}

export function copyableMessageText(content: string) {
  return markdownToText(stripMessageMarkup(content))
}

export function copyableMessageHtml(content: string) {
  return renderMarkdown(stripMessageMarkup(content)).trim()
}

export async function copyMessageToClipboard(content: string) {
  const plainText = copyableMessageText(content)
  const html = copyableMessageHtml(content)
  const clipboard = navigator.clipboard
  const ClipboardItemConstructor = globalThis.ClipboardItem

  if (clipboard.write && ClipboardItemConstructor && html) {
    await clipboard.write([
      new ClipboardItemConstructor({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      }),
    ])
    return
  }

  await clipboard.writeText(plainText)
}

function markdownToText(content: string) {
  const html = renderMarkdown(content).replace(breakTagRegex, '\n')
  const template = document.createElement('template')
  template.innerHTML = html
  const blocks: string[] = []
  template.content.childNodes.forEach((node) => collectTextBlocks(node, blocks))
  return blocks.join('\n').trim()
}

function collectTextBlocks(node: Node, blocks: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim()
    if (text) {
      blocks.push(normalizeText(text))
    }
    return
  }

  if (!(node instanceof HTMLElement)) {
    return
  }

  const tagName = node.tagName.toLowerCase()
  if (tagName === 'br') {
    blocks.push('')
    return
  }

  if (tagName === 'li' || tagName === 'p' || tagName === 'pre' || tagName === 'blockquote' || /^h[1-6]$/.test(tagName)) {
    const text = node.textContent?.trim()
    if (text) {
      blocks.push(normalizeText(text))
    }
    return
  }

  node.childNodes.forEach((child) => collectTextBlocks(child, blocks))
}

function normalizeText(text: string) {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}
