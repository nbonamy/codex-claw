export type CodeReviewPriority = 'p0' | 'p1' | 'p2' | 'p3';

export type CodeReviewLocation = {
  file: string;
  line?: number;
  endLine?: number;
};

export type CodeReviewDiscussionMessage = {
  id: string;
  author: 'user' | 'reviewer';
  body: string;
  createdAt: string;
};

export type CodeReviewDisposition =
  | { state: 'unresolved' }
  | { state: 'accepted'; decidedAt: string }
  | { state: 'declined'; decidedAt: string; reason: string };

export type CodeReviewVerification =
  | { state: 'notRequested' }
  | { state: 'queued'; assignedAgentId: string; requestedAt: string }
  | { state: 'fixing'; assignedAgentId: string; startedAt: string }
  | { state: 'awaitingVerification'; assignedAgentId: string; completedAt: string }
  | { state: 'passed'; verifiedAt: string; roundId: string }
  | { state: 'failed'; verifiedAt: string; roundId: string; evidence: string };

export type CodeReviewFinding = {
  /** Stable across rounds when a finding is re-observed or verified. */
  id: string;
  roundId: string;
  fingerprint: string;
  priority: CodeReviewPriority;
  summary: string;
  rationale: string;
  suggestedResolution: string;
  location?: CodeReviewLocation;
  disposition: CodeReviewDisposition;
  assignedAgentId?: string;
  discussion: CodeReviewDiscussionMessage[];
  verification: CodeReviewVerification;
  materiallyNewEvidence?: string;
  createdAt: string;
  updatedAt: string;
};

export type CodeReviewRound = {
  id: string;
  number: number;
  status: 'reviewing' | 'ready' | 'submitted' | 'completed' | 'failed';
  reviewerContextId: string;
  findings: CodeReviewFinding[];
  startedAt: string;
  completedAt?: string;
  error?: string;
};

export type CodeReviewSession = {
  id: string;
  agentId: string;
  status: 'reviewing' | 'ready' | 'fixing' | 'readyToFinish' | 'finished' | 'failed';
  activeRoundId: string;
  rounds: CodeReviewRound[];
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
};

export type CodeReviewFindingInput = Pick<
  CodeReviewFinding,
  'fingerprint' | 'priority' | 'summary' | 'rationale' | 'suggestedResolution'
> & {
  location?: CodeReviewLocation;
  priorFindingId?: string;
  materiallyNewEvidence?: string;
};

export type CodeReviewLedger = {
  exclusions: Array<{
    findingId: string;
    fingerprint: string;
    summary: string;
    reason: string;
  }>;
  regressionChecks: Array<{
    findingId: string;
    fingerprint: string;
    summary: string;
    suggestedResolution: string;
    verification: CodeReviewVerification['state'];
  }>;
  behaviorDecisions: Array<{
    findingId: string;
    summary: string;
    discussion: CodeReviewDiscussionMessage[];
  }>;
};

export type CodeReviewProgress = {
  total: number;
  unresolved: number;
  accepted: number;
  declined: number;
  awaitingVerification: number;
  verified: number;
};

export function activeCodeReviewRound(session: CodeReviewSession): CodeReviewRound {
  const round = session.rounds.find((candidate) => candidate.id === session.activeRoundId);
  if (!round) throw new Error('Active review round is missing.');
  return round;
}

export function latestCodeReviewSession(sessions: readonly CodeReviewSession[] | undefined): CodeReviewSession | null {
  return sessions?.at(-1) ?? null;
}

export function codeReviewLedger(session: CodeReviewSession): CodeReviewLedger {
  const latestByFindingId = new Map<string, CodeReviewFinding>();
  for (const round of session.rounds) {
    for (const finding of round.findings) latestByFindingId.set(finding.id, finding);
  }
  const findings = [...latestByFindingId.values()];
  return {
    exclusions: findings.flatMap((finding) => finding.disposition.state === 'declined'
      ? [{
          findingId: finding.id,
          fingerprint: finding.fingerprint,
          summary: finding.summary,
          reason: finding.disposition.reason,
        }]
      : []),
    regressionChecks: findings.flatMap((finding) => finding.disposition.state === 'accepted'
      ? [{
          findingId: finding.id,
          fingerprint: finding.fingerprint,
          summary: finding.summary,
          suggestedResolution: finding.suggestedResolution,
          verification: finding.verification.state,
        }]
      : []),
    behaviorDecisions: findings
      .filter((finding) => finding.discussion.length > 0)
      .map((finding) => ({
        findingId: finding.id,
        summary: finding.summary,
        discussion: finding.discussion.map((message) => ({ ...message })),
      })),
  };
}

export function codeReviewProgress(session: CodeReviewSession): CodeReviewProgress {
  const findings = session.rounds.flatMap((round) => round.findings);
  return findings.reduce<CodeReviewProgress>((progress, finding) => {
    progress.total += 1;
    if (finding.disposition.state === 'unresolved') progress.unresolved += 1;
    if (finding.disposition.state === 'accepted') progress.accepted += 1;
    if (finding.disposition.state === 'declined') progress.declined += 1;
    if (finding.verification.state === 'awaitingVerification') progress.awaitingVerification += 1;
    if (finding.verification.state === 'passed') progress.verified += 1;
    return progress;
  }, { total: 0, unresolved: 0, accepted: 0, declined: 0, awaitingVerification: 0, verified: 0 });
}

export function cloneCodeReviewSessions(sessions: readonly CodeReviewSession[]): CodeReviewSession[] {
  return structuredClone(sessions) as CodeReviewSession[];
}

export function isCodeReviewSession(value: unknown): value is CodeReviewSession {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.agentId !== 'string') return false;
  if (!isReviewSessionStatus(value.status) || typeof value.activeRoundId !== 'string') return false;
  if (!Array.isArray(value.rounds) || value.rounds.length === 0 || value.rounds.some((round) => !isCodeReviewRound(round))) return false;
  return typeof value.createdAt === 'string' && typeof value.updatedAt === 'string';
}

function isCodeReviewRound(value: unknown): value is CodeReviewRound {
  return isRecord(value)
    && typeof value.id === 'string'
    && Number.isInteger(value.number)
    && typeof value.reviewerContextId === 'string'
    && isReviewRoundStatus(value.status)
    && Array.isArray(value.findings)
    && value.findings.every(isCodeReviewFinding)
    && typeof value.startedAt === 'string';
}

function isCodeReviewFinding(value: unknown): value is CodeReviewFinding {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.roundId === 'string'
    && typeof value.fingerprint === 'string'
    && isPriority(value.priority)
    && typeof value.summary === 'string'
    && typeof value.rationale === 'string'
    && typeof value.suggestedResolution === 'string'
    && isDisposition(value.disposition)
    && Array.isArray(value.discussion)
    && value.discussion.every(isDiscussionMessage)
    && isVerification(value.verification)
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string';
}

function isDisposition(value: unknown): value is CodeReviewDisposition {
  if (!isRecord(value)) return false;
  if (value.state === 'unresolved') return true;
  if (value.state === 'accepted') return typeof value.decidedAt === 'string';
  return value.state === 'declined' && typeof value.decidedAt === 'string' && typeof value.reason === 'string';
}

function isVerification(value: unknown): value is CodeReviewVerification {
  if (!isRecord(value) || typeof value.state !== 'string') return false;
  if (value.state === 'notRequested') return true;
  if (value.state === 'queued') return typeof value.assignedAgentId === 'string' && typeof value.requestedAt === 'string';
  if (value.state === 'fixing') return typeof value.assignedAgentId === 'string' && typeof value.startedAt === 'string';
  if (value.state === 'awaitingVerification') return typeof value.assignedAgentId === 'string' && typeof value.completedAt === 'string';
  if (value.state === 'passed') return typeof value.verifiedAt === 'string' && typeof value.roundId === 'string';
  return value.state === 'failed'
    && typeof value.verifiedAt === 'string'
    && typeof value.roundId === 'string'
    && typeof value.evidence === 'string';
}

function isDiscussionMessage(value: unknown): value is CodeReviewDiscussionMessage {
  return isRecord(value)
    && typeof value.id === 'string'
    && (value.author === 'user' || value.author === 'reviewer')
    && typeof value.body === 'string'
    && typeof value.createdAt === 'string';
}

function isPriority(value: unknown): value is CodeReviewPriority {
  return value === 'p0' || value === 'p1' || value === 'p2' || value === 'p3';
}

function isReviewSessionStatus(value: unknown): value is CodeReviewSession['status'] {
  return value === 'reviewing' || value === 'ready' || value === 'fixing' || value === 'readyToFinish'
    || value === 'finished' || value === 'failed';
}

function isReviewRoundStatus(value: unknown): value is CodeReviewRound['status'] {
  return value === 'reviewing' || value === 'ready' || value === 'submitted'
    || value === 'completed' || value === 'failed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
