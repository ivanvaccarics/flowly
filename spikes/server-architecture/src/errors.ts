export class FlowlySpikeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class WrongPassphraseError extends FlowlySpikeError {}

export class VaultCorruptError extends FlowlySpikeError {}

export class VaultLockedError extends FlowlySpikeError {}

export class VaultNotFoundError extends FlowlySpikeError {}

export class ArchivePasswordError extends FlowlySpikeError {}

export class ArchiveIntegrityError extends FlowlySpikeError {}

export class SessionError extends FlowlySpikeError {}

export class SimulatedCrashError extends FlowlySpikeError {}
