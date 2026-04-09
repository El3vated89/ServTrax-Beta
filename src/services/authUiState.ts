export const AUTH_REDIRECT_PENDING_KEY = 'servtrax-auth-redirect-pending';
export const AUTH_REDIRECT_PENDING_CHANGED_EVENT = 'servtrax-auth-redirect-pending-changed';
const AUTH_REDIRECT_PENDING_MAX_AGE_MS = 2 * 60 * 1000;

const emitAuthRedirectPendingChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_REDIRECT_PENDING_CHANGED_EVENT));
};

export const markAuthRedirectPending = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(AUTH_REDIRECT_PENDING_KEY, new Date().toISOString());
  emitAuthRedirectPendingChanged();
};

export const clearAuthRedirectPending = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
  emitAuthRedirectPendingChanged();
};

export const isAuthRedirectPending = () => {
  if (typeof window === 'undefined') return false;

  const rawValue = window.sessionStorage.getItem(AUTH_REDIRECT_PENDING_KEY);
  if (!rawValue) return false;

  const startedAt = new Date(rawValue).getTime();
  if (Number.isNaN(startedAt)) {
    clearAuthRedirectPending();
    return false;
  }

  const isFresh = Date.now() - startedAt <= AUTH_REDIRECT_PENDING_MAX_AGE_MS;
  if (!isFresh) {
    clearAuthRedirectPending();
    return false;
  }

  return true;
};

export const subscribeToAuthRedirectPending = (callback: (pending: boolean) => void) => {
  if (typeof window === 'undefined') return () => {};

  const sync = () => callback(isAuthRedirectPending());
  sync();
  window.addEventListener(AUTH_REDIRECT_PENDING_CHANGED_EVENT, sync);

  return () => {
    window.removeEventListener(AUTH_REDIRECT_PENDING_CHANGED_EVENT, sync);
  };
};
