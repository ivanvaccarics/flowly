export interface StartedAuthorization {
  linkId: string;
  url: string;
  state: string;
  expiresAt: string;
  aspspName: string;
}

export interface ParsedRedirect {
  code?: string;
  state?: string;
  error?: string;
  description?: string;
}

/** Opens the bank in its own window while the panel keeps polling. */
export function openBankWindow(url: string): void {
  if (typeof window === "undefined") return;
  window.open(url, "flowly-bank-authorization", "width=600,height=760,popup=yes");
}

/** The callback address this browser is using right now. */
export function currentCallbackUrl(): string {
  return typeof window === "undefined"
    ? ""
    : `${window.location.origin}/enablebanking/auth_callback`;
}

/**
 * The bank sends the browser to the registered callback URL, so a hostname or
 * port that this browser cannot open never comes back.
 */
export function callbackMismatch(redirectUrl: string): string | undefined {
  if (typeof window === "undefined" || redirectUrl.trim() === "") return undefined;
  let origin: string;
  try {
    origin = new URL(redirectUrl).origin;
  } catch {
    return "This is not a full URL. Register a complete https address in Enable Banking.";
  }
  if (origin === window.location.origin) return undefined;
  return `The bank will send your browser to ${origin}, but you are using ${window.location.origin} right now. That works when ${origin} opens Flowly too, because the server finishes the handshake there; if it does not, register ${window.location.origin} in the Enable Banking control panel instead.`;
}

/** Reads a pasted callback URL or query string from the bank redirect. */
export function parseRedirect(raw: string): ParsedRedirect {
  const value = raw.trim();
  if (value === "") return {};
  let search = "";
  try {
    search = new URL(value).search;
  } catch {
    search = value.startsWith("?") ? value : `?${value}`;
  }
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const description = params.get("error_description");
  return {
    ...(code ? { code } : {}),
    ...(state ? { state } : {}),
    ...(error ? { error } : {}),
    ...(description ? { description } : {}),
  };
}
