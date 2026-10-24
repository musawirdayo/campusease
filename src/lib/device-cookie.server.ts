// Shared "anonymous device" cookie helpers, used by every server route that
// needs a stable per-device identity (for saved schedules).
// HttpOnly so scripts can't read it, Secure so it only ever travels over
// HTTPS, SameSite=Lax so normal navigation keeps it.
export const DEVICE_COOKIE = "ce_device";
export const DEVICE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Read the device token from the request's Cookie header, or mint a fresh
 *  one (`fresh: true` → the caller must Set-Cookie the new token). */
export function deviceFrom(request: Request): {
  token: string;
  fresh: boolean;
} {
  const raw = request.headers.get("cookie") ?? "";
  const match = raw.match(
    new RegExp(`${DEVICE_COOKIE}=([A-Za-z0-9_-]{10,64})`),
  );
  if (match) return { token: match[1]!, fresh: false };
  return { token: crypto.randomUUID().replace(/-/g, ""), fresh: true };
}

/** Set-Cookie value for a minted token; null when the request already had one. */
export function deviceCookieHeader(
  token: string,
  fresh: boolean,
): string | null {
  if (!fresh) return null;
  return `${DEVICE_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DEVICE_MAX_AGE}`;
}

/** Return a fresh headers object with Set-Cookie applied when needed. */
export function withDeviceCookie(
  headers: Record<string, string>,
  setCookie: string | null,
): Record<string, string> {
  return setCookie ? { ...headers, "set-cookie": setCookie } : { ...headers };
}
