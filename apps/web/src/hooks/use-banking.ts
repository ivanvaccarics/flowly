import { useCallback, useEffect, useRef, useState } from "react";
import { api, type BankingStatus } from "../api/client.js";
import { describeError } from "./use-workspace.js";

export interface Banking {
  status: BankingStatus | undefined;
  loading: boolean;
  busy: boolean;
  error: string | undefined;
  refresh: () => Promise<void>;
  /** Runs an action, refreshes the status and surfaces any failure. */
  run: <T>(action: () => Promise<T>) => Promise<T | undefined>;
  clearError: () => void;
}

/** Enable Banking status plus a small mutation helper, shared by the UI. */
export function useBanking(csrf: string | undefined, enabled: boolean): Banking {
  const [status, setStatus] = useState<BankingStatus | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !csrf) return;
    setLoading(true);
    try {
      const next = await api.bankingStatus();
      if (mounted.current) {
        setStatus(next);
        setError(undefined);
      }
    } catch (cause) {
      if (mounted.current) setError(describeError(cause));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [csrf, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      try {
        const result = await action();
        await refresh();
        setError(undefined);
        return result;
      } catch (cause) {
        setError(describeError(cause));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return {
    status,
    loading,
    busy,
    error,
    refresh,
    run,
    clearError: useCallback(() => setError(undefined), []),
  };
}
