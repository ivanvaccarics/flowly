/**
 * Tag identity is Unicode-normalized, trimmed, whitespace-collapsed and
 * lowercased. It mirrors the server's `normalizeTagName`, which validates that
 * every stored `normalizedName` matches its `name`.
 */
export function normalizeTagName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The colour a tag is shown in until someone picks another one: the brand's
 * medium green, so an untouched vault still looks like Flowly.
 */
export const DEFAULT_TAG_COLOR = "#1e6f4e";
