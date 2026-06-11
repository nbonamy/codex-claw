import type { WorkItem, WorkItemLabel, WorkRepository } from '../../shared/contracts';
import { runtimeGitHubOAuthClientId } from '../runtime-config';
import type { WorkProviderToken } from './token-store';
import type { WorkProviderDeviceAuthorization, WorkProviderDeviceTokenResult, WorkProviderDriver } from './types';

const GITHUB_API_BASE_URL = 'https://api.github.com';
const GITHUB_OAUTH_BASE_URL = 'https://github.com/login';
const GITHUB_API_VERSION = '2022-11-28';
const DEFAULT_SCOPE = 'repo read:user';

export class GitHubWorkProviderDriver implements WorkProviderDriver {
  readonly provider = 'github' as const;

  constructor(private readonly clientIdProvider: string | (() => string | null | undefined) = runtimeGitHubOAuthClientId) {}

  configured(): boolean {
    return Boolean(this.clientId().trim());
  }

  async startAuthorization(): Promise<WorkProviderDeviceAuthorization> {
    if (!this.configured()) {
      throw new Error('GitHub OAuth is not configured. Add a GitHub OAuth app client ID in Settings or set CODEX_CLAW_GITHUB_CLIENT_ID.');
    }

    const response = await githubOAuthRequest(`${GITHUB_OAUTH_BASE_URL}/device/code`, {
      client_id: this.clientId(),
      scope: DEFAULT_SCOPE,
    });

    if (isRecord(response) && typeof response.error === 'string') {
      throw new Error(githubOAuthErrorMessage(response));
    }

    if (!isRecord(response) ||
      typeof response.device_code !== 'string' ||
      typeof response.user_code !== 'string' ||
      typeof response.verification_uri !== 'string' ||
      typeof response.expires_in !== 'number'
    ) {
      throw new Error('GitHub returned an invalid device authorization response.');
    }

    return {
      provider: 'github',
      deviceCode: response.device_code,
      userCode: response.user_code,
      verificationUri: response.verification_uri,
      expiresAt: new Date(Date.now() + response.expires_in * 1000).toISOString(),
      intervalSeconds: typeof response.interval === 'number' ? response.interval : 5,
    };
  }

  async pollAuthorization(deviceCode: string): Promise<WorkProviderDeviceTokenResult> {
    if (!this.configured()) {
      return {
        status: 'error',
        code: 'not_configured',
        message: 'GitHub OAuth is not configured.',
      };
    }

    const response = await githubOAuthRequest(`${GITHUB_OAUTH_BASE_URL}/oauth/access_token`, {
      client_id: this.clientId(),
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });

    if (isRecord(response) && typeof response.error === 'string') {
      if (response.error === 'authorization_pending') {
        return {
          status: 'pending',
          ...(typeof response.interval === 'number' ? { intervalSeconds: response.interval } : {}),
        };
      }

      if (response.error === 'slow_down') {
        return {
          status: 'pending',
          intervalSeconds: typeof response.interval === 'number' ? response.interval : undefined,
        };
      }

      if (response.error === 'expired_token') {
        return {
          status: 'error',
          code: 'expired',
          message: 'The GitHub verification code expired. Start the connection again.',
        };
      }

      if (response.error === 'access_denied') {
        return {
          status: 'error',
          code: 'access_denied',
          message: 'GitHub authorization was cancelled.',
        };
      }

      return {
        status: 'error',
        code: 'unavailable',
        message: githubOAuthErrorMessage(response),
      };
    }

    if (!isRecord(response) || typeof response.access_token !== 'string') {
      return {
        status: 'error',
        code: 'unavailable',
        message: 'GitHub returned an invalid access token response.',
      };
    }

    return {
      status: 'success',
      token: {
        accessToken: response.access_token,
        tokenType: typeof response.token_type === 'string' ? response.token_type : 'bearer',
        ...(typeof response.scope === 'string' ? { scope: response.scope } : {}),
      },
    };
  }

  async currentAccountLabel(token: WorkProviderToken): Promise<string> {
    const user = await githubApiRequest(token, '/user');
    if (!isRecord(user) || typeof user.login !== 'string') {
      throw new Error('GitHub returned an invalid user response.');
    }

    return user.login;
  }

  async listRepositories(token: WorkProviderToken): Promise<WorkRepository[]> {
    const repositories = await githubApiRequest(token, '/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100');
    if (!Array.isArray(repositories)) {
      throw new Error('GitHub returned an invalid repositories response.');
    }

    return repositories.map(githubRepository).filter((repository): repository is WorkRepository => Boolean(repository));
  }

  async listItems(token: WorkProviderToken, repositoryId: string): Promise<WorkItem[]> {
    const repository = parseRepositoryId(repositoryId);
    if (!repository) {
      return [];
    }

    const issues = await githubApiRequest(token, `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/issues?state=open&per_page=50`);
    if (!Array.isArray(issues)) {
      throw new Error('GitHub returned an invalid issues response.');
    }

    return issues.map((issue) => githubIssue(issue, repositoryId, repository.fullName)).filter((item): item is WorkItem => Boolean(item));
  }

  private clientId(): string {
    const value = typeof this.clientIdProvider === 'function' ? this.clientIdProvider() : this.clientIdProvider;
    return typeof value === 'string' ? value.trim() : '';
  }
}

async function githubOAuthRequest(url: string, input: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(input),
  });

  return response.json();
}

function githubOAuthErrorMessage(response: Record<string, unknown>): string {
  if (typeof response.error_description === 'string') {
    return response.error_description;
  }

  if (response.error === 'device_flow_disabled') {
    return 'Device flow is disabled for this GitHub App. Enable device flow in the GitHub App settings and try again.';
  }

  return typeof response.error === 'string'
    ? `GitHub authorization failed: ${response.error}`
    : 'GitHub authorization failed.';
}

async function githubApiRequest(token: WorkProviderToken, path: string): Promise<unknown> {
  const response = await fetch(`${GITHUB_API_BASE_URL}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub request failed with ${response.status}.`);
  }

  return response.json();
}

function githubRepository(value: unknown): WorkRepository | null {
  if (!isRecord(value) || typeof value.full_name !== 'string' || typeof value.html_url !== 'string') {
    return null;
  }

  const [owner, name] = value.full_name.split('/');
  if (!owner || !name) {
    return null;
  }

  return {
    provider: 'github',
    id: value.full_name,
    owner,
    name,
    fullName: value.full_name,
    url: value.html_url,
    isPrivate: value.private === true,
    ...(typeof value.updated_at === 'string' ? { updatedAt: value.updated_at } : {}),
  };
}

function githubIssue(value: unknown, repositoryId: string, repositoryFullName: string): WorkItem | null {
  const issueNumber = isRecord(value) && Number.isInteger(value.number) ? value.number : null;
  if (!isRecord(value) ||
    typeof issueNumber !== 'number' ||
    typeof value.title !== 'string' ||
    typeof value.html_url !== 'string' ||
    typeof value.created_at !== 'string' ||
    typeof value.updated_at !== 'string'
  ) {
    return null;
  }

  if (isRecord(value.pull_request)) {
    return null;
  }

  return {
    provider: 'github',
    id: `${repositoryId}#${issueNumber}`,
    repositoryId,
    repositoryFullName,
    number: issueNumber,
    title: value.title,
    url: value.html_url,
    state: value.state === 'closed' ? 'closed' : 'open',
    ...(isRecord(value.user) && typeof value.user.login === 'string' ? { authorName: value.user.login } : {}),
    ...(Array.isArray(value.assignees) ? { assignees: value.assignees.map(githubIssueAssignee).filter((login): login is string => Boolean(login)) } : {}),
    ...(typeof value.body === 'string' ? { body: value.body } : {}),
    labels: Array.isArray(value.labels) ? value.labels.map(githubIssueLabel).filter((label): label is WorkItemLabel => Boolean(label)) : [],
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function githubIssueAssignee(value: unknown): string | null {
  return isRecord(value) && typeof value.login === 'string' && value.login.trim() ? value.login : null;
}

function githubIssueLabel(value: unknown): WorkItemLabel | null {
  if (!isRecord(value) || typeof value.name !== 'string') {
    return null;
  }

  return {
    name: value.name,
    ...(typeof value.color === 'string' ? { color: value.color } : {}),
  };
}

function parseRepositoryId(repositoryId: string): { fullName: string; name: string; owner: string } | null {
  const [owner, name] = repositoryId.split('/');
  return owner && name ? { owner, name, fullName: `${owner}/${name}` } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
