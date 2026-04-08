import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { auth } = vi.hoisted(() => ({
  auth: {
    currentUser: null as any,
    onAuthStateChanged: vi.fn(),
  },
}));

vi.mock('../firebase', () => ({
  auth,
}));

import { waitForCurrentUser } from './authSessionService';

describe('waitForCurrentUser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    auth.currentUser = null;
    auth.onAuthStateChanged.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately when a current user already exists', async () => {
    auth.currentUser = { uid: 'owner-1' };

    await expect(waitForCurrentUser()).resolves.toEqual({ uid: 'owner-1' });
  });

  it('rejects on timeout instead of hanging forever', async () => {
    auth.onAuthStateChanged.mockReturnValue(() => {});

    const promise = waitForCurrentUser({ timeoutMs: 100 });
    const rejection = expect(promise).rejects.toThrow('Authentication timed out while waiting for the current session.');
    await vi.advanceTimersByTimeAsync(101);
    await rejection;
  });
});
