/**
 * Turns the `error` / `error_description` query parameters Enable Banking adds
 * to the callback into something a person can act on.
 */
export function describeBankAuthorizationError(error: string, description?: string): string {
  const detail = description?.trim() ? ` (${description.trim()})` : "";
  switch (error.toLowerCase()) {
    case "access_denied":
      return `The authorization was cancelled or refused at the bank${detail}. Start the connection again if you meant to approve it.`;
    case "server_error":
      return `Enable Banking reported an internal error at the bank${detail}. This is usually temporary: try again, or pick another bank if it keeps failing.`;
    case "invalid_request":
      return `Enable Banking rejected the request${detail}. Check the application id, the private key and the registered callback URL.`;
    case "unauthorized_client":
    case "invalid_client":
      return `Enable Banking did not accept the application credentials${detail}. Re-save the key in Settings.`;
    default:
      return `The bank refused the connection: ${error}${detail}.`;
  }
}
