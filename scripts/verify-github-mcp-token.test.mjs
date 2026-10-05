import product from '../core/src/product.json' with { type: 'json' };
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  githubAccessTokenFromFile,
  githubLoginFromToolResult,
  githubMcpHeaders,
  providerTokensFilePath,
  redactGitHubCredentials,
  verifyGitHubMcpToken,
} from './verify-github-mcp-token.mjs';

test(`resolves the token file from the ${product.name} home`, () => {
  assert.equal(
    providerTokensFilePath({ APP_HOME: ' /tmp/app-home ' }, '/Users/test'),
    '/tmp/app-home/provider-tokens.json',
  );
  assert.equal(providerTokensFilePath({}, '/Users/test'), `/Users/test/${product.homeDirectory}/provider-tokens.json`);
});

test('reads only the connected GitHub access token', () => {
  assert.equal(githubAccessTokenFromFile(JSON.stringify({
    tokens: { github: { accessToken: ' ghu_access ' } },
  })), 'ghu_access');
  assert.throws(() => githubAccessTokenFromFile('{}'), /No connected GitHub access token/);
  assert.throws(() => githubAccessTokenFromFile('{'), /not valid JSON/);
});

test('limits the MCP probe to the read-only get_me tool', () => {
  assert.deepEqual(githubMcpHeaders('ghu_secret'), {
    Authorization: 'Bearer ghu_secret',
    'X-MCP-Readonly': 'true',
    'X-MCP-Tools': 'get_me',
  });
});

test('extracts only the GitHub login from the tool result', () => {
  assert.equal(githubLoginFromToolResult({
    content: [{ type: 'text', text: JSON.stringify({ login: 'octocat', email: 'private@example.com' }) }],
  }), 'octocat');
  assert.equal(githubLoginFromToolResult({ content: [{ type: 'text', text: 'not json' }] }), null);
});

test('calls GitHub MCP with the stored token and closes the connection', async () => {
  const calls = [];
  const result = await verifyGitHubMcpToken({
    filePath: '/tokens.json',
    endpoint: 'https://example.test/mcp',
    readTextFile: async (filePath, encoding) => {
      calls.push(['read', filePath, encoding]);
      return JSON.stringify({ tokens: { github: { accessToken: 'ghu_secret' } } });
    },
    createConnection: ({ endpoint, accessToken }) => {
      calls.push(['create', endpoint.href, accessToken]);
      return {
        connect: async () => calls.push(['connect']),
        callGetMe: async () => {
          calls.push(['get_me']);
          return { content: [{ type: 'text', text: '{"login":"octocat"}' }] };
        },
        close: async () => calls.push(['close']),
      };
    },
  });

  assert.deepEqual(result, { endpoint: 'https://example.test/mcp', login: 'octocat' });
  assert.deepEqual(calls, [
    ['read', '/tokens.json', 'utf8'],
    ['create', 'https://example.test/mcp', 'ghu_secret'],
    ['connect'],
    ['get_me'],
    ['close'],
  ]);
});

test('redacts GitHub credentials from failures and still closes', async () => {
  let closed = false;
  await assert.rejects(() => verifyGitHubMcpToken({
    readTextFile: async () => JSON.stringify({ tokens: { github: { accessToken: 'ghu_supersecret' } } }),
    createConnection: () => ({
      connect: async () => undefined,
      callGetMe: async () => { throw new Error('rejected ghu_supersecret'); },
      close: async () => { closed = true; },
    }),
  }), (error) => {
    assert.equal(error.message, 'rejected [redacted]');
    return true;
  });
  assert.equal(closed, true);
  assert.equal(redactGitHubCredentials('tokens gho_12345678 and github_pat_abcdefgh'), 'tokens [redacted] and [redacted]');
});
