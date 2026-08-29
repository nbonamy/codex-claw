import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NodeTypes, parse, type RootNode, type TemplateChildNode } from '@vue/compiler-dom';
import { parse as parseSfc } from '@vue/compiler-sfc';
import { appErrorCodes } from '@codex-claw/core/app-error';
import { messages } from '../i18n/messages';

describe('i18n contract', () => {
  it('presents every structured app error in the renderer catalog', () => {
    for (const code of appErrorCodes) {
      expect(messageAtPath(messages.en, `errors.${code}`), code).toEqual(expect.any(String));
    }
  });

  it('presents every app-text descriptor emitted by core, backend, or Electron', () => {
    const workspaceRoot = resolve(process.cwd(), '..');
    const roots = ['core/src', 'backend/src', 'electron/src/main'].map((path) => join(workspaceRoot, path));
    const keys = roots.flatMap(tsFiles).flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return [...source.matchAll(/\bkey:\s*['"]((?:backend|panels|permissions|workProvider)\.[^'"]+)['"]/gu)]
        .map((match) => match[1]!);
    });

    for (const key of new Set(keys)) {
      expect(messageAtPath(messages.en, key), key).toEqual(expect.any(String));
    }
  });

  it('keeps production Vue templates free of literal product copy', () => {
    const sourceRoot = resolve(process.cwd(), 'src');

    for (const path of vueFiles(sourceRoot)) {
      const component = path.slice(sourceRoot.length + 1);
      const template = parseSfc(readFileSync(path, 'utf8'), { filename: component }).descriptor.template?.content ?? '';
      const { text, attributes } = literalTemplateCopy(parse(template));

      expect({ text, attributes }, component).toStrictEqual({ text: [], attributes: [] });
    }
  });
});

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : vueFiles(path);
    return entry.isFile() && entry.name.endsWith('.vue') ? [path] : [];
  });
}

function tsFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : tsFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

function literalTemplateCopy(root: RootNode): { text: string[]; attributes: string[] } {
  const text: string[] = [];
  const attributes: string[] = [];
  const presentationAttributes = new Set(['aria-label', 'ariaLabel', 'placeholder', 'title', 'label', 'description', 'alt']);

  const visit = (node: RootNode | TemplateChildNode): void => {
    if (node.type === NodeTypes.TEXT) {
      const value = node.content.trim();
      if (/[A-Za-z]/u.test(value)) text.push(value);
      return;
    }
    if (node.type === NodeTypes.ELEMENT) {
      for (const prop of node.props) {
        if (prop.type !== NodeTypes.ATTRIBUTE || !presentationAttributes.has(prop.name) || !prop.value) continue;
        if (/[A-Za-z]/u.test(prop.value.content) && prop.value.content !== 'Codex Claw') {
          attributes.push(prop.value.content);
        }
      }
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (typeof child === 'object' && child !== null && 'type' in child) visit(child as TemplateChildNode);
      }
    }
  };

  visit(root);
  return { text, attributes };
}

function messageAtPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => (
    typeof current === 'object' && current !== null
      ? (current as Record<string, unknown>)[segment]
      : undefined
  ), value);
}
