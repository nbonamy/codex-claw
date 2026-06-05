import { Marked, Renderer } from 'marked'

const renderer = new Renderer()

renderer.html = ({ text }) => escapeHtml(text)

renderer.link = ({ href, title, tokens }) => {
  const text = renderInlineTokens(tokens)
  const safeHref = escapeAttribute(href)
  const safeTitle = title ? ` title="${escapeAttribute(title)}"` : ''
  const icon = renderLinkIcon(href)
  const target = isAbsoluteHttpUrl(href) ? ' target="_blank" rel="noreferrer"' : ''
  return `<a class="chat-message-link" href="${safeHref}"${safeTitle}${target}>${icon}<span class="chat-message-link__label">${text}</span></a>`
}

const markdown = new Marked({
  async: false,
  breaks: true,
  gfm: true,
  renderer,
})

markdown.use({
  extensions: [
    {
      name: 'taskList',
      renderer(token) {
        const taskList = token as unknown as { items?: unknown }
        const items: unknown[] = Array.isArray(taskList.items)
          ? taskList.items
          : []
        return `<ul>${items.map((item) => renderTaskItem(item)).join('')}</ul>`
      },
    },
    {
      name: 'taskItem',
      renderer: renderTaskItem,
    },
  ],
})

export function renderMarkdown(content: string) {
  return markdown.parse(content) as string
}

export function renderUserText(content: string) {
  return `<p>${escapeHtml(content)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')}</p>`
}

function escapeHtml(content: string) {
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttribute(content: string) {
  return escapeHtml(content).replace(/`/g, '&#96;')
}

function isAbsoluteHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isMailtoUrl(value: string) {
  try {
    return new URL(value).protocol === 'mailto:'
  } catch {
    return false
  }
}

const faviconUrlCache = new Map<string, string>()

export function faviconUrl(value: string) {
  const origin = absoluteHttpOrigin(value)
  if (!origin) {
    return ''
  }

  const cached = faviconUrlCache.get(origin)
  if (cached) {
    return cached
  }

  const url = `https://s2.googleusercontent.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(origin)}`
  faviconUrlCache.set(origin, url)
  return url
}

export function absoluteHttpOrigin(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.origin
    }
  } catch {
    return null
  }

  return null
}

function renderLinkIcon(href: string) {
  if (isAbsoluteHttpUrl(href)) {
    const iconUrl = faviconUrl(href)
    return `<span class="chat-message-link__icon chat-message-link__icon--favicon" aria-hidden="true" style="--favicon-url: url('${escapeAttribute(iconUrl)}')"></span>`
  }

  if (isMailtoUrl(href)) {
    return '<svg class="chat-message-link__icon chat-message-link__icon--mail" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>'
  }

  return '<svg class="chat-message-link__icon chat-message-link__icon--file" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path></svg>'
}

function renderInlineTokens(tokens: unknown[]) {
  return tokens.map(renderInlineToken).join('')
}

export function renderInlineToken(token: unknown): string {
  if (!token || typeof token !== 'object') {
    return ''
  }

  const inlineToken = token as {
    raw?: unknown
    text?: unknown
    tokens?: unknown[]
    type?: unknown
  }

  if (Array.isArray(inlineToken.tokens)) {
    const content = renderInlineTokens(inlineToken.tokens)
    if (inlineToken.type === 'strong') {
      return `<strong>${content}</strong>`
    }
    if (inlineToken.type === 'em') {
      return `<em>${content}</em>`
    }
    return content
  }

  if (inlineToken.type === 'codespan' && typeof inlineToken.text === 'string') {
    return `<code>${escapeHtml(inlineToken.text)}</code>`
  }

  if (typeof inlineToken.text === 'string') {
    return escapeHtml(inlineToken.text)
  }

  if (typeof inlineToken.raw === 'string') {
    return escapeHtml(inlineToken.raw)
  }

  return ''
}

export function renderTaskItem(token: unknown) {
  const task = token && typeof token === 'object' ? token as Record<string, unknown> : {}
  const checked = task.checked === true
  const tokens: Array<{ raw?: string; text?: string }> = Array.isArray(task.tokens)
    ? task.tokens as Array<{ raw?: string; text?: string }>
    : []
  const text = tokens.length > 0
    ? markdown.parseInline(tokens.map((item) => item.raw ?? item.text ?? '').join('')) as string
    : escapeHtml(String(task.mainContent ?? task.text ?? ''))
  const nested = Array.isArray(task.nestedTokens) && task.nestedTokens.length > 0
    ? (markdown.parser as unknown as (tokens: unknown[]) => string)(task.nestedTokens)
    : ''

  return `<li><input${checked ? ' checked=""' : ''} disabled="" type="checkbox"> ${text}${nested}</li>`
}
