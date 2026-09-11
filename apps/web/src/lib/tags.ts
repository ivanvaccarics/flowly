/**
 * Tag identity is Unicode-normalized, trimmed, whitespace-collapsed and
 * lowercased. It mirrors the server's `normalizeTagName`, which validates that
 * every stored `normalizedName` matches its `name`.
 */
export function normalizeTagName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}
