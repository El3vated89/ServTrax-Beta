import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';

vi.mock('../firebase', () => ({
  db: {},
}));

vi.mock('./authSessionService', () => ({
  waitForCurrentUser: vi.fn(),
}));

import { normalizeLocalFallbackRecordForRecovery } from './localFallbackRecoveryService';

describe('local fallback recovery normalization', () => {
  it('converts recoverable date strings into Firestore timestamps', () => {
    const normalized = normalizeLocalFallbackRecordForRecovery(
      {
        id: 'local:jobs:1',
        created_at: '2026-04-09T12:00:00.000Z',
        updated_at: '2026-04-09T12:05:00.000Z',
        scheduled_date: '2026-04-10T09:00:00.000Z',
        customer_name_snapshot: 'Acme',
      },
      'owner-1'
    );

    expect(normalized.ownerId).toBe('owner-1');
    expect(normalized.created_at).toBeInstanceOf(Timestamp);
    expect(normalized.updated_at).toBeInstanceOf(Timestamp);
    expect(normalized.scheduled_date).toBeInstanceOf(Timestamp);
  });

  it('keeps non-date strings unchanged', () => {
    const normalized = normalizeLocalFallbackRecordForRecovery(
      {
        start_date: '11-01',
        end_date: '03-31',
        notes: 'Keep original strings',
      },
      'owner-1'
    );

    expect(normalized.start_date).toBe('11-01');
    expect(normalized.end_date).toBe('03-31');
    expect(normalized.notes).toBe('Keep original strings');
  });
});
