import { describe, expect, it } from 'vitest';
import {
  absoluteHttpOrigin,
  faviconUrl,
  renderInlineToken,
  renderMarkdown,
  renderTaskItem,
  renderUserText,
} from '../message-markdown';

describe('message markdown rendering', () => {
  it('escapes raw html but renders markdown structures', () => {
    const html = renderMarkdown('<script>bad</script>\n\n- one\n- two\n\n`code`');

    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<code>code</code>');
  });

  it('renders safe link icons for web, mail, and file-style links', () => {
    const html = renderMarkdown([
      '[web](https://example.com/a)',
      '[mail](mailto:test@example.com)',
      '[file](README.md)',
    ].join('\n'));

    expect(html).toContain('chat-message-link__icon--favicon');
    expect(html).toContain('chat-message-link__icon--mail');
    expect(html).toContain('chat-message-link__icon--file');
    expect(html).toContain('target="_blank" rel="noreferrer"');
  });

  it('renders titled links, nested strong tokens, and task lists', () => {
    const html = renderMarkdown('[**docs**](https://example.com "Docs")\n\n- [x] done\n- [ ] todo');

    expect(html).toContain('title="Docs"');
    expect(html).toContain('<strong>docs</strong>');
    expect(html).toContain('checked=""');
    expect(html).toContain('type="checkbox"');
  });

  it('renders user text as escaped preformatted text with inline code', () => {
    expect(renderUserText('hello `code`\n<script>')).toBe('<p>hello <code>code</code><br>&lt;script&gt;</p>');
  });

  it('covers defensive inline token and task item rendering branches', () => {
    expect(renderInlineToken(null)).toBe('');
    expect(renderInlineToken({ tokens: [{ text: 'loud' }], type: 'strong' })).toBe('<strong>loud</strong>');
    expect(renderInlineToken({ tokens: [{ text: 'quiet' }], type: 'em' })).toBe('<em>quiet</em>');
    expect(renderInlineToken({ tokens: [{ text: 'plain' }], type: 'span' })).toBe('plain');
    expect(renderInlineToken({ raw: '<raw>' })).toBe('&lt;raw&gt;');
    expect(renderInlineToken({})).toBe('');

    expect(renderTaskItem(null)).toContain('<input disabled="" type="checkbox">');
    expect(renderTaskItem({ checked: true, text: 'fallback' })).toContain('checked=""');
    expect(renderTaskItem({ mainContent: 'main' })).toContain('main');
  });

  it('covers favicon origin caching and invalid URL paths', () => {
    expect(absoluteHttpOrigin('https://example.com/a')).toBe('https://example.com');
    expect(absoluteHttpOrigin('mailto:test@example.com')).toBeNull();
    expect(absoluteHttpOrigin('not a url')).toBeNull();
    expect(faviconUrl('not a url')).toBe('');
    expect(faviconUrl('https://example.com/a')).toBe(faviconUrl('https://example.com/b'));
  });
});
