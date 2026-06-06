import { createHighlighterCoreSync } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import css from '@shikijs/langs/css'
import diff from '@shikijs/langs/diff'
import docker from '@shikijs/langs/docker'
import go from '@shikijs/langs/go'
import html from '@shikijs/langs/html'
import javascript from '@shikijs/langs/javascript'
import json from '@shikijs/langs/json'
import jsx from '@shikijs/langs/jsx'
import markdown from '@shikijs/langs/markdown'
import python from '@shikijs/langs/python'
import rust from '@shikijs/langs/rust'
import shell from '@shikijs/langs/sh'
import sql from '@shikijs/langs/sql'
import toml from '@shikijs/langs/toml'
import tsx from '@shikijs/langs/tsx'
import typescript from '@shikijs/langs/typescript'
import vue from '@shikijs/langs/vue'
import xml from '@shikijs/langs/xml'
import yaml from '@shikijs/langs/yaml'
import githubDark from '@shikijs/themes/github-dark'
import githubLight from '@shikijs/themes/github-light'
import { escapeAttribute, escapeHtml } from './html-escape'

const highlighter = createHighlighterCoreSync({
  engine: createJavaScriptRegexEngine(),
  langs: [
    css,
    diff,
    docker,
    go,
    html,
    javascript,
    json,
    jsx,
    markdown,
    python,
    rust,
    shell,
    sql,
    toml,
    tsx,
    typescript,
    vue,
    xml,
    yaml,
  ],
  themes: [githubLight, githubDark],
})

const loadedLanguages = new Set(highlighter.getLoadedLanguages())

export function renderCodeBlock(code: string, language: string | undefined) {
  const lang = normalizeLanguage(language)
  if (!lang || !loadedLanguages.has(lang)) {
    return renderPlainCodeBlock(code, language)
  }

  try {
    return highlighter.codeToHtml(code, {
      defaultColor: false,
      lang,
      themes: {
        dark: 'github-dark',
        light: 'github-light',
      },
    })
  } catch {
    return renderPlainCodeBlock(code, language)
  }
}

function normalizeLanguage(language: string | undefined) {
  const [lang] = (language ?? '').trim().toLowerCase().split(/\s+/)
  return lang || null
}

function renderPlainCodeBlock(code: string, language: string | undefined) {
  const lang = normalizeLanguage(language)
  const className = lang ? ` class="language-${escapeAttribute(lang)}"` : ''
  return `<pre><code${className}>${escapeHtml(code)}</code></pre>`
}
