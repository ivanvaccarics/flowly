import type { Clock } from "../domain/clock.js";
import type { VaultStore, ListOptions, StoredRefs, VaultTable } from "./store.js";
import { StorageError } from "./errors.js";

export interface RepositoryEntity {
  id: string;
  revision: number;
  updatedAt: string;
}

export interface Repository<T extends RepositoryEntity> {
  get(id: string): Promise<T | undefined>;
  list(options?: ListOptions): Promise<T[]>;
  count(): Promise<number>;
  create(value: T): Promise<T>;
  update(value: T, expectedRevision: number): Promise<T>;
  delete(id: string, expectedRevision: number): Promise<void>;
}

export interface StoreRepositoryOptions<T extends RepositoryEntity> {
  /** Resolved per call so a locked vault fails with VaultLockedError. */
  getStore: () => VaultStore;
  table: VaultTable;
  clock: Clock;
  validate: (value: T) => void;
  refs?: (value: T) => StoredRefs;
}

/** Repository over the encrypted store; every write is revision-checked. */
export class StoreRepository<T extends RepositoryEntity> implements Repository<T> {
  private readonly getStore: () => VaultStore;
  private readonly table: VaultTable;
  private readonly clock: Clock;
  private readonly validate: (value: T) => void;
  private readonly refs: (value: T) => StoredRefs;

  constructor(options: StoreRepositoryOptions<T>) {
    this.getStore = options.getStore;
    this.table = options.table;
    this.clock = options.clock;
    this.validate = options.validate;
    this.refs = options.refs ?? (() => ({}));
  }

  async get(id: string): Promise<T | undefined> {
    return this.getStore().read<T>(this.table, id);
  }

  async list(options?: ListOptions): Promise<T[]> {
    return this.getStore().list<T>(this.table, options);
  }

  async count(): Promise<number> {
    return this.getStore().count(this.table);
  }

  async create(value: T): Promise<T> {
    if (value.revision !== 1) {
      throw new StorageError(`new ${this.table} records must start at revision 1`);
    }
    this.validate(value);
    await this.getStore().insert(this.table, value.id, value, this.refs(value));
    return value;
  }

  async update(value: T, expectedRevision: number): Promise<T> {
    this.validate(value);
    const updatedAt = this.clock.nowIso();
    const next = { ...value, updatedAt };
    const revision = await this.getStore().replace(
      this.table,
      value.id,
      next,
      expectedRevision,
      this.refs(next),
    );
    return { ...next, revision };
  }

  async delete(id: string, expectedRevision: number): Promise<void> {
    return this.getStore().remove(this.table, id, expectedRevision);
  }
}
