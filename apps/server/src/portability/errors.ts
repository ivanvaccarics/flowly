export class ArchivePasswordError extends Error {
  constructor(message = "archive password is incorrect or the archive was tampered with") {
    super(message);
    this.name = "ArchivePasswordError";
  }
}

export class ArchiveIntegrityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ArchiveIntegrityError";
  }
}

export class ImportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ImportError";
  }
}
