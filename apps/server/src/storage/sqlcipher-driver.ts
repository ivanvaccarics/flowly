import { createRequire } from "node:module";
import type * as Sqlite3 from "@journeyapps/sqlcipher";
import { StorageError } from "./errors.js";

const require = createRequire(import.meta.url);

/** Promise wrapper around the callback-based `@journeyapps/sqlcipher` driver. */
export class SqlcipherDatabase {
  readonly driverVersion: string;
  readonly cipherVersion: string;

  private readonly db: Sqlite3.Database;
  private closed = false;

  private constructor(db: Sqlite3.Database, cipherVersion: string) {
    this.db = db;
    this.driverVersion = String(
      (require("@journeyapps/sqlcipher/package.json") as { version: string }).version,
    );
    this.cipherVersion = cipherVersion;
  }

  static async open(file: string, rawKey: Buffer): Promise<SqlcipherDatabase> {
    if (rawKey.byteLength !== 32) {
      throw new StorageError("SQLCipher raw key must be exactly 32 bytes");
    }
    const sqlite3 = require("@journeyapps/sqlcipher") as typeof Sqlite3;
    const handle = await new Promise<Sqlite3.Database>((resolve, reject) => {
      const database = new sqlite3.Database(file, (error) => {
        if (error) reject(new StorageError(`cannot open the vault database: ${error.message}`));
        else resolve(database);
      });
    });
    const instance = new SqlcipherDatabase(handle, "unknown");
    await instance.exec("PRAGMA busy_timeout = 5000");
    await instance.exec(`PRAGMA key = "x'${rawKey.toString("hex")}'"`);
    await instance.exec("PRAGMA cipher_memory_security = ON");
    await instance.exec("PRAGMA foreign_keys = ON");
    await instance.exec("PRAGMA journal_mode = WAL");
    const row = await instance.getRow<{ cipher_version?: string }>("PRAGMA cipher_version");
    if (!row?.cipher_version) {
      throw new StorageError("the database could not be decrypted with the vault key");
    }
    return new SqlcipherDatabase(handle, row.cipher_version);
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
