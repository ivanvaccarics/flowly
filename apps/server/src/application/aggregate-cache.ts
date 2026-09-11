import { systemClock, type Clock } from "../domain/clock.js";
import type { Vault } from "../vault/vault.js";

const CACHES = new WeakMap<object, AggregateCache>();

/**
 * In-memory cache for expensive aggregates. It is keyed by a cheap fingerprint
 * of the vault tables, so any write invalidates it naturally, and it lives only
 * in memory: nothing derived from decrypted data is ever persisted.
 */
export class AggregateCache {
  private readonly entries = new Map<string, unknown>();
  private readonly vault: Vault;
  private readonly clock: Clock;
  private readonly maxEntries: number;
  private hitCount = 0;
  private missCount = 0;

  constructor(vault: Vault, clock: Clock = systemClock, maxEntries = 32) {
    this.vault = vault;
    this.clock = clock;
    this.maxEntries = maxEntries;
  }

  get hits(): number {
    return this.hitCount;
  }

  get misses(): number {
    return this.missCount;
  }

  get size(): number {
    return this.entries.size;
  }

  async get<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const fingerprint = await this.fingerprint();
    const cacheKey = `${fingerprint}|${key}`;
    if (this.entries.has(cacheKey)) {
      this.hitCount += 1;
      return this.entries.get(cacheKey) as T;
    }
    this.missCount += 1;
    const value = await compute();
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(cacheKey, value);
    return value;
  }

  clear(): void {
    this.entries.clear();
  }

  private async fingerprint(): Promise<string> {
    const tables = ["accounts", "transactions", "tags", "tagging_rules"] as const;
    const stats = await Promise.all(tables.map((table) => this.vault.tableStats(table)));
    const now = this.clock.nowIso();
    return `${now.slice(0, 10)}|${tables
      .map(
        (table, index) =>
          `${table}:${stats[index]?.count ?? 0}:${stats[index]?.updatedAtMax ?? "-"}`,
      )
      .join(",")}`;
  }
}

export function cacheFor(vault: Vault, clock: Clock = systemClock): AggregateCache {
  const existing = CACHES.get(vault);
  if (existing) return existing;
  const cache = new AggregateCache(vault, clock);
  CACHES.set(vault, cache);
  return cache;
}
