export const DEFAULT_AUTH_RETURN_TARGET = "/terminal";

const AUTH_RETURN_TARGET_ORIGIN = "https://dizytrades.invalid";
const ALLOWED_AUTH_RETURN_PATH = /^\/(?:terminal(?:\/|$)|account(?:\/|$))/;
const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/i;
const UNSAFE_CHARACTER = /[\\\u0000-\u001f\u007f]/;

/**
 * Accept only bounded local application paths for post-authentication navigation.
 * External, protocol-relative, encoded-separator and non-workspace destinations
 * collapse to the terminal rather than becoming an open redirect primitive.
 */
export function safeAuthReturnTarget(value: unknown) {
  if (typeof value !== "string") return DEFAULT_AUTH_RETURN_TARGET;
  const candidate = value.trim();
  if (
    !candidate
    || candidate.length > 1_024
    || !candidate.startsWith("/")
    || candidate.startsWith("//")
    || UNSAFE_CHARACTER.test(candidate)
    || ENCODED_PATH_SEPARATOR.test(candidate)
  ) return DEFAULT_AUTH_RETURN_TARGET;

  try {
    const url = new URL(candidate, AUTH_RETURN_TARGET_ORIGIN);
    if (url.origin !== AUTH_RETURN_TARGET_ORIGIN || !ALLOWED_AUTH_RETURN_PATH.test(url.pathname)) {
      return DEFAULT_AUTH_RETURN_TARGET;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_AUTH_RETURN_TARGET;
  }
}
