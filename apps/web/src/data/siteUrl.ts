/** Resolve relative saved previews into links that QR readers can open. */
export function absoluteSiteUrl(raw: string | null | undefined, origin?: string): string | null {
  if (!raw) return null;
  const base = origin ?? (typeof location !== 'undefined' ? location.origin : undefined);
  try {
    const url = new URL(raw, base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export const DEMO_RECORDING = 'fixture:live-boba-g2';
export const DEMO_SITE_PATH = '/sites/run_4hN7Q1M-b-/';
export function isPublicDemo(): boolean {
  return import.meta.env.VITE_PUBLIC_DEMO === '1' ||
    (typeof location !== 'undefined' && /^\/demo\/?$/.test(location.pathname));
}
