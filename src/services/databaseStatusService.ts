export type DatabaseIssueKind = 'quota_exhausted' | 'permission' | 'unknown';

export interface DatabaseIssue {
  kind: DatabaseIssueKind;
  message: string;
  source?: string;
  detectedAt: number;
}

const listeners = new Set<(issue: DatabaseIssue | null) => void>();
let currentIssue: DatabaseIssue | null = null;

const normalizeErrorText = (error: unknown) => {
  if (!error) return '';

  if (error instanceof Error) {
    return `${error.name} ${error.message}`;
  }

  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const detectIssue = (error: unknown, source?: string): DatabaseIssue => {
  const text = normalizeErrorText(error).toLowerCase();

  if (
    text.includes('quota limit exceeded') ||
    text.includes('resource_exhausted') ||
    text.includes('free daily read units per project')
  ) {
    return {
      kind: 'quota_exhausted',
      message: "ServTrax can't load live database data right now because the Firebase Firestore daily read quota is exhausted. Data may look empty and saves may not refresh until the quota resets.",
      source,
      detectedAt: Date.now(),
    };
  }

  if (
    text.includes('missing or insufficient permissions') ||
    text.includes('permission-denied')
  ) {
    return {
      kind: 'permission',
      message: "ServTrax hit a live database permission problem. Some data may be hidden until the Firebase rules or signed-in account access are corrected.",
      source,
      detectedAt: Date.now(),
    };
  }

  return {
    kind: 'unknown',
    message: 'ServTrax hit a live database error. Some screens may fail to load or refresh until the backend connection is healthy again.',
    source,
    detectedAt: Date.now(),
  };
};

const emit = () => {
  listeners.forEach((listener) => listener(currentIssue));
};

export const databaseStatusService = {
  getCurrentIssue: () => currentIssue,

  getUserMessage: (error: unknown, source?: string) => detectIssue(error, source).message,

  reportIssue: (error: unknown, source?: string) => {
    currentIssue = detectIssue(error, source);
    emit();
    return currentIssue;
  },

  clearIssue: () => {
    currentIssue = null;
    emit();
  },

  subscribe: (callback: (issue: DatabaseIssue | null) => void) => {
    listeners.add(callback);
    callback(currentIssue);
    return () => {
      listeners.delete(callback);
    };
  },
};
