import { beforeEach, describe, expect, it } from 'vitest';
import { databaseStatusService } from './databaseStatusService';

describe('databaseStatusService', () => {
  beforeEach(() => {
    databaseStatusService.clearIssue();
  });

  it('detects Firestore quota exhaustion errors', () => {
    const issue = databaseStatusService.reportIssue(
      new Error("Quota limit exceeded. Cause - Quota exceeded for quota metric 'Free daily read units per project (free tier database)'")
    );

    expect(issue.kind).toBe('quota_exhausted');
    expect(issue.message).toContain('daily read quota is exhausted');
  });

  it('detects Firestore permission errors', () => {
    const issue = databaseStatusService.reportIssue(
      new Error('Missing or insufficient permissions.')
    );

    expect(issue.kind).toBe('permission');
    expect(issue.message).toContain('permission problem');
  });
});
