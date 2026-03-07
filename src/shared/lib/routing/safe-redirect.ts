export function isValidInternalRedirect(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('//')) return false;
  if (url.includes('://')) return false;
  if (url.startsWith('http')) return false;
  if (!url.startsWith('/')) return false;
  return true;
}

export function sanitizeRedirectUrl(url: string, fallback: string): string {
  return isValidInternalRedirect(url) ? url : fallback;
}
