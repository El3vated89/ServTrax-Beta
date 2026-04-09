export const AUTH_REDIRECT_PENDING_KEY = 'servtrax-auth-redirect-pending';

export const markAuthRedirectPending = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(AUTH_REDIRECT_PENDING_KEY, new Date().toISOString());
};

export const clearAuthRedirectPending = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
};

export const isAuthRedirectPending = () => {
  if (typeof window === 'undefined') return false;
  return !!window.sessionStorage.getItem(AUTH_REDIRECT_PENDING_KEY);
};
