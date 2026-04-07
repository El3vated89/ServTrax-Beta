export const getPublicOrigin = () => {
  let origin = window.location.origin;
  
  // If we're on a dev URL, return the corresponding pre URL
  if (origin.includes('ais-dev-')) {
    origin = origin.replace('ais-dev-', 'ais-pre-');
  }
  
  // Ensure no trailing slash for consistent path joining
  return origin.replace(/\/$/, '');
};
