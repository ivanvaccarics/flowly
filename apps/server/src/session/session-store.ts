import { randomBytes } from "node:crypto";

export interface Session {
  id: string;
  csrf: string;
  address: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface SessionStoreOptions {
  idleMs: number;
  absoluteMs: number;
  now?: () => number;
}

/** Server-side browser sessions with idle and absolute expiry. */
export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly idleMs: number;
  private readonly absoluteMs: number;
  private readonly now: () => number;

  constructor(options: SessionStoreOptions) {
    this.idleMs = options.idleMs;
    this.absoluteMs = options.absoluteMs;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    this.sweep();
    return this.sessions.size;
  }

  create(address: string): Session {
    const now = this.now();
    const session: Session = {
      id: randomBytes(32).toString("base64url"),
      csrf: randomBytes(32).toString("base64url"),
      address,
      createdAt: now,
      lastSeenAt: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /** Returns the session and refreshes its idle timer, or undefined when expired. */
  touch(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (this.isExpired(session)) {
      this.sessions.delete(id);
      return undefined;
    }
    session.lastSeenAt = this.now();
    return session;
  }

  peek(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (this.isExpired(session)) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  clear(): void {
    this.sessions.clear();
  }

  sweep(): number {
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (this.isExpired(session)) {
        this.sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  private isExpired(session: Session): boolean {
    const now = this.now();
    return now - session.lastSeenAt > this.idleMs || now - session.createdAt > this.absoluteMs;
  }
}

/** Sliding-window limiter used for unlock attempts per client address. */
export class AttemptLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(limit: number, windowMs = 60_000, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  consume(key: string): boolean {
    const now = this.now();
    const recent = (this.attempts.get(key) ?? []).filter(
      (timestamp) => now - timestamp < this.windowMs,
    );
    if (recent.length >= this.limit) {
      this.attempts.set(key, recent);
      return false;
    }
    recent.push(now);
    this.attempts.set(key, recent);
    return true;
  }

  reset(key?: string): void {
    if (key === undefined) this.attempts.clear();
    else this.attempts.delete(key);
  }
}
