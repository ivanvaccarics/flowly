export class VaultKeyError extends Error {
  constructor(message = "vault passphrase is incorrect or the key material was tampered with") {
    super(message);
    this.name = "VaultKeyError";
  }
}

export class VaultCorruptError extends Error {
  readonly detail: string;

  constructor(detail: string, options?: ErrorOptions) {
    super(`vault data failed validation: ${detail}`, options);
    this.name = "VaultCorruptError";
    this.detail = detail;
  }
}
