export interface TransactionExecutor {
  exec(sql: string): Promise<void>;
}

/**
 * Re-entrant, serialized transaction runner.
 *
 * Nested calls join the running transaction instead of opening a second one,
 * and concurrent callers queue up, so a single connection never interleaves two
 * transactions or rolls back someone else's work.
 */
export function createTransactionRunner(
  executor: TransactionExecutor,
): <T>(work: () => Promise<T>) => Promise<T> {
  let depth = 0;
  let queue: Promise<unknown> = Promise.resolve();

  return async function transaction<T>(work: () => Promise<T>): Promise<T> {
    if (depth > 0) return work();

    const run = async (): Promise<T> => {
      depth += 1;
      await executor.exec("BEGIN IMMEDIATE");
      try {
        const result = await work();
        await executor.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          await executor.exec("ROLLBACK");
        } catch {
          // The connection may already be unusable; the caller reports the error.
        }
        throw error;
      } finally {
        depth -= 1;
      }
    };

    const result = queue.then(run, run);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
