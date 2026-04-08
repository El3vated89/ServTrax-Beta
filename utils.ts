export const getPublicOrigin = () => {
  const appBase = `${window.location.origin}${window.location.pathname}`;
  return appBase.replace(/\/$/, '');
};
