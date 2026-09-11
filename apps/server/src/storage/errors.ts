export class StorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class RecordExistsError extends StorageError {
  readonly table: string;
  readonly id: string;

  constructor(table: string, id: string) {
    super(`${table} record ${id} already exists`);
    this.table = table;
    this.id = id;
  }
}

export class RecordNotFoundError extends StorageError {
  readonly table: string;
  readonly id: string;

  constructor(table: string, id: string) {
    super(`${table} record ${id} does not exist`);
    this.table = table;
    this.id = id;
  }
}

/** Raised when a caller tries to write with a stale revision. */
export class ConflictError extends StorageError {
  readonly table: string;
  readonly id: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(table: string, id: string, expectedRevision: number, actualRevision: number) {
    super(
      `${table} record ${id} changed since revision ${expectedRevision} (current ${actualRevision})`,
    );
    this.table = table;
    this.id = id;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export class SimulatedCrashError extends StorageError {
  constructor(message: string) {
    super(message);
  }
}
