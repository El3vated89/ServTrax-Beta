import { describe, expect, it, vi } from 'vitest';

const { auth } = vi.hoisted(() => ({
  auth: {
    currentUser: null as any,
  },
}));

vi.mock('../firebase', () => ({
  auth,
  db: {},
}));

import { userProfileService } from './userProfileService';

describe('userProfileService.isPlatformAdmin', () => {
  it('accepts the persisted admin role even when auth email is missing', () => {
    auth.currentUser = null;

    expect(
      userProfileService.isPlatformAdmin({
        uid: 'user-1',
        email: '',
        role: 'admin',
      })
    ).toBe(true);
  });

  it('accepts the platform admin email regardless of casing', () => {
    auth.currentUser = {
      uid: 'user-1',
      email: 'ThomasLMiller89@Gmail.com',
    };

    expect(userProfileService.isPlatformAdmin(null)).toBe(true);
  });
});
