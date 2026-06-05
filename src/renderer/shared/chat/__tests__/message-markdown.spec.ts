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
  it('renders task lists in chat messages', () => {
    const html = renderMarkdown('- [ ] Todo\n- [x] Done');

    expect(html).toContain('type="checkbox"');
    expect(html).toContain('Todo');
    expect(html).toContain('Done');
  });

  it('renders autolinked email addresses without recursing', () => {
    const html = renderMarkdown('1. **nbonamy@gmail.com**');

    expect(html).toContain('nbonamy@gmail.com');
    expect(html).toContain('<strong>');
  });

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

  it('adds safe link attributes to markdown links', () => {
    const html = renderMarkdown('[OpenAI](https://openai.com)');

    expect(html).toContain('class="chat-message-link"');
    expect(html).toContain('href="https://openai.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain('chat-message-link__icon--favicon');
    expect(html).toContain("--favicon-url: url('https://s2.googleusercontent.com/s2/favicons?sz=32&amp;domain_url=https%3A%2F%2Fopenai.com')");
    expect(html).toContain('<span class="chat-message-link__label">OpenAI</span>');
  });

  it('normalizes external favicon URLs to the link origin', () => {
    const html = renderMarkdown('[Vue docs](https://vuejs.org/guide/introduction.html?from=id8)');

    expect(html).toContain('domain_url=https%3A%2F%2Fvuejs.org');
    expect(html).not.toContain('domain_url=https%3A%2F%2Fvuejs.org%2Fguide');
  });

  it('reuses cached favicon URLs for links from the same origin', () => {
    renderMarkdown('[First](https://cached.example/one)');

    const html = renderMarkdown('[Second](https://cached.example/two)');

    expect(html).toContain('domain_url=https%3A%2F%2Fcached.example');
    expect(html).toContain('<span class="chat-message-link__label">Second</span>');
  });

  it('renders relative links with a file icon', () => {
    const html = renderMarkdown('[Open file](src/index.html)');

    expect(html).toContain('href="src/index.html"');
    expect(html).toContain('chat-message-link__icon--file');
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain('s2.googleusercontent.com');
  });

  it('renders titled links, nested strong tokens, and task lists', () => {
    const html = renderMarkdown('[**docs**](https://example.com "Docs")\n\n- [x] done\n- [ ] todo');

    expect(html).toContain('title="Docs"');
    expect(html).toContain('<strong>docs</strong>');
    expect(html).toContain('checked=""');
    expect(html).toContain('type="checkbox"');
  });

  it('renders inline formatting inside links without losing escaping', () => {
    const html = renderMarkdown('[**Docs** and `code`](https://example.com "`title`")');

    expect(html).toContain('<strong>Docs</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('title="&#96;title&#96;"');
  });

  it('renders emphasized and escaped inline link text', () => {
    const html = renderMarkdown('[*A&B*](https://example.com)');

    expect(html).toContain('<em>A&amp;B</em>');
  });

  it('renders mail links with a mail icon', () => {
    const html = renderMarkdown('[Mail](mailto:nicolas@example.com)');

    expect(html).toContain('href="mailto:nicolas@example.com"');
    expect(html).toContain('chat-message-link__icon--mail');
    expect(html).not.toContain('chat-message-link__icon--file');
    expect(html).not.toContain('target="_blank"');
  });

  it('does not treat other non-http absolute URLs as external links', () => {
    const html = renderMarkdown('[Call](tel:+15551234567)');

    expect(html).toContain('href="tel:+15551234567"');
    expect(html).toContain('chat-message-link__icon--file');
    expect(html).not.toContain('target="_blank"');
  });

  it('falls back to a file icon for malformed absolute-looking links', () => {
    const html = renderMarkdown('[Broken](https://%)');

    expect(html).toContain('href="https://%"');
    expect(html).toContain('chat-message-link__icon--file');
    expect(html).not.toContain('target="_blank"');
  });

  it('renders plain autolinks with escaped labels', () => {
    const html = renderMarkdown('<https://example.com/search?q=a&b=c>');

    expect(html).toContain('href="https://example.com/search?q=a&amp;b=c"');
    expect(html).toContain('q=a&amp;b=c');
  });

  it('escapes backticks in relative link hrefs', () => {
    const html = renderMarkdown('[Open](docs/`draft`.md)');

    expect(html).toContain('href="docs/&#96;draft&#96;.md"');
  });

  it('falls back to escaped task text when marked has no tokens', () => {
    const html = renderMarkdown('- [ ] <b>raw</b>');

    expect(html).toContain('&lt;b&gt;raw&lt;/b&gt;');
    expect(html).not.toContain('<b>raw</b>');
  });

  it('renders nested task content', () => {
    const html = renderMarkdown('- [x] Parent\n  - Child');

    expect(html).toContain('checked=""');
    expect(html).toContain('Parent');
    expect(html).toContain('Child');
  });

  it('renders user text as escaped preformatted text with inline code', () => {
    expect(renderUserText('hello `code`\n<script>')).toBe('<p>hello <code>code</code><br>&lt;script&gt;</p>');
  });

  it('escapes user text while preserving backticks and line breaks', () => {
    expect(renderUserText('Use `<tag>`\nthen stop')).toBe('<p>Use <code>&lt;tag&gt;</code><br>then stop</p>');
  });

  it('escapes all user text html-sensitive characters', () => {
    expect(renderUserText('&<>"\'')).toBe('<p>&amp;&lt;&gt;&quot;&#39;</p>');
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
