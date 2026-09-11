import { createRequire } from "node:module";
import type * as Sqlite3 from "@journeyapps/sqlcipher";

const require = createRequire(import.meta.url);

export interface AsyncSqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface SqlcipherOpenOptions {
  /** 32-byte raw SQLCipher key; when omitted the database is left unkeyed. */
  rawKey?: Buffer;
}

/** Promise wrapper around the callback-based `@journeyapps/sqlcipher` driver. */
export class SqlcipherDatabase implements AsyncSqlExecutor {
  readonly driverVersion: string;
  readonly cipherVersion: string;
  readonly file: string;

  private readonly db: Sqlite3.Database;
  private closed = false;

  private constructor(db: Sqlite3.Database, file: string, cipherVersion: string) {
    this.db = db;
    this.file = file;
    this.driverVersion = String(require("@journeyapps/sqlcipher/package.json").version);
    this.cipherVersion = cipherVersion;
  }

  static async open(file: string, options: SqlcipherOpenOptions = {}): Promise<SqlcipherDatabase> {
    const sqlite3 = require("@journeyapps/sqlcipher") as typeof Sqlite3;
    const db = await new Promise<Sqlite3.Database>((resolve, reject) => {
      const handle = new sqlite3.Database(file, (error) => {
        if (error) reject(error);
        else resolve(handle);
      });
    });
    const instance = new SqlcipherDatabase(db, file, "unknown");
    await instance.exec("PRAGMA busy_timeout = 5000");
    if (options.rawKey) {
      if (options.rawKey.byteLength !== 32) {
        throw new Error("SQLCipher raw key must be exactly 32 bytes");
      }
      await instance.exec(`PRAGMA key = "x'${options.rawKey.toString("hex")}'"`);
      await instance.exec("PRAGMA cipher_memory_security = ON");
    }
    await instance.exec("PRAGMA foreign_keys = ON");
    await instance.exec("PRAGMA journal_mode = WAL");
    const row = await instance.getRow<{ cipher_version?: string }>("PRAGMA cipher_version");
    return new SqlcipherDatabase(db, file, row?.cipher_version ?? "unavailable");
  }

  exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (error) => (error ? reject(error) : resolve()));
    });
  }

  run(sql: string, params: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (error) => (error ? reject(error) : resolve()));
    });
  }

  async getRow<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params);
    return rows[0];
  }

  all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (error, rows: T[]) => (error ? reject(error) : resolve(rows)));
    });
  }

  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.closed = true;
    return new Promise((resolve, reject) => {
      this.db.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
