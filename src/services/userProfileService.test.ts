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
  it('accepts the proven Thomas Firebase UID even if email is missing', () => {
    auth.currentUser = {
      uid: '2r4JbcS7irNBWhJiYmf2Y9ry8MW2',
      email: '',
    };

    expect(userProfileService.isPlatformAdmin(null)).toBe(true);
  });

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

  it('accepts the googlemail alias for the platform admin account', () => {
    auth.currentUser = {
      uid: 'user-1',
      email: 'thomaslmiller89@googlemail.com',
    };

    expect(userProfileService.isPlatformAdmin(null)).toBe(true);
  });

  it('still treats the Thomas UID as platform admin when the profile role is owner', () => {
    auth.currentUser = {
      uid: '2r4JbcS7irNBWhJiYmf2Y9ry8MW2',
      email: '',
    };

    expect(
      userProfileService.isPlatformAdmin({
        uid: '2r4JbcS7irNBWhJiYmf2Y9ry8MW2',
        email: '',
        role: 'owner',
      })
    ).toBe(true);
  });
});
