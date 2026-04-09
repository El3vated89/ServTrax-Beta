export const PLATFORM_ADMIN_UID = '2r4JbcS7irNBWhJiYmf2Y9ry8MW2';
export const PLATFORM_ADMIN_EMAIL = 'thomaslmiller89@gmail.com';

const normalizeEmail = (value?: string | null) => (value || '').trim().toLowerCase();

export const normalizePlatformAdminEmail = (value?: string | null) => {
  const normalized = normalizeEmail(value);
  const match = normalized.match(/^([^@]+)@(gmail\.com|googlemail\.com)$/);

  if (!match) return normalized;

  const localPart = match[1].replace(/\./g, '');
  return `${localPart}@gmail.com`;
};

export const isPlatformAdminIdentity = (identity?: { uid?: string | null; email?: string | null } | null) => {
  if (!identity) return false;
  if ((identity.uid || '').trim() === PLATFORM_ADMIN_UID) return true;
  return normalizePlatformAdminEmail(identity.email) === PLATFORM_ADMIN_EMAIL;
};
