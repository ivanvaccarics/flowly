/**
 * What a dashboard chart hands the ledger when one of its points is clicked:
 * the ledger opens on that tag, that period, or both, instead of on everything.
 */
export interface LedgerFilterSeed {
  tagId?: string;
  from?: string;
  to?: string;
}

/** Identity of a seed, so a new drill-down remounts the ledger with it. */
export function ledgerSeedKey(seed: LedgerFilterSeed | undefined): string {
  return [seed?.tagId ?? "", seed?.from ?? "", seed?.to ?? ""].join("|");
}
