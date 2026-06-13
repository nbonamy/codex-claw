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
import darkPlus from '@shikijs/themes/dark-plus'
import lightPlus from '@shikijs/themes/light-plus'
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
  themes: [lightPlus, darkPlus],
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
        dark: 'dark-plus',
        light: 'light-plus',
      },
    })
  } catch {
    return renderPlainCodeBlock(code, language)
  }
}

export function languageForFilePath(filePath: string | undefined): string | undefined {
  const normalizedPath = (filePath ?? '').trim().toLowerCase();
  const extension = normalizedPath.match(/\.([^.\\/]+)$/)?.[1];
  switch (extension) {
    case 'css':
      return 'css';
    case 'diff':
    case 'patch':
      return 'diff';
    case 'dockerfile':
      return 'docker';
    case 'go':
      return 'go';
    case 'htm':
    case 'html':
      return 'html';
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'json':
    case 'jsonc':
      return 'json';
    case 'jsx':
      return 'jsx';
    case 'md':
    case 'markdown':
    case 'mdown':
    case 'mkdn':
      return 'markdown';
    case 'py':
      return 'python';
    case 'rs':
      return 'rust';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'sh';
    case 'sql':
      return 'sql';
    case 'toml':
      return 'toml';
    case 'ts':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'vue':
      return 'vue';
    case 'xml':
    case 'svg':
      return 'xml';
    case 'yaml':
    case 'yml':
      return 'yaml';
    default:
      if (normalizedPath.endsWith('/dockerfile') || normalizedPath === 'dockerfile') {
        return 'docker';
      }
      return extension;
  }
}

function normalizeLanguage(language: string | undefined) {
  const [lang] = (language ?? '').trim().toLowerCase().split(/\s+/)
  return lang || null
}

function renderPlainCodeBlock(code: string, language: string | undefined) {
  const lang = normalizeLanguage(language)
  const className = lang ? ` class="language-${escapeAttribute(lang)}"` : ''
  return `<pre><code${className}>${renderPlainCodeLines(code)}</code></pre>`
}

function renderPlainCodeLines(code: string) {
  return code.split('\n').map((line) => `<span class="line">${escapeHtml(line)}</span>`).join('')
}
