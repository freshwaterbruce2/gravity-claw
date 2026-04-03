const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const DESKTOP_APP_ORIGIN = 'app://app';
const FALLBACK_ORIGIN = 'http://localhost:5177';

export function resolveCorsOrigin(origin?: string): string {
  if (!origin) {
    return FALLBACK_ORIGIN;
  }

  if (origin === DESKTOP_APP_ORIGIN || LOCAL_DEV_ORIGIN.test(origin)) {
    return origin;
  }

  return FALLBACK_ORIGIN;
}

export function isAllowedCorsOrigin(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  return origin === DESKTOP_APP_ORIGIN || LOCAL_DEV_ORIGIN.test(origin);
}
