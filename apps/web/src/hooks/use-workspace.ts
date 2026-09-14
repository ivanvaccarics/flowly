import { useCallback, useEffect, useState } from "react";
import type { VaultStatus } from "@flowly/web-contracts";
import { ApiError, api } from "../api/client.js";

export interface Workspace {
  status: VaultStatus | undefined;
  csrf: string | undefined;
  loading: boolean;
  error: string | undefined;
  busy: boolean;
  refresh: () => Promise<void>;
  createVault: (passphrase: string) => Promise<boolean>;
  unlock: (passphrase: string) => Promise<boolean>;
  lock: (scope: "current" | "all") => Promise<void>;
  changePassphrase: (current: string, next: string) => Promise<boolean>;
  clearError: () => void;
}

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "invalid_passphrase":
        return "That passphrase did not unlock the vault.";
      case "vault_not_found":
        return "No vault exists yet on this server. Create one to get started.";
      case "vault_exists":
        return "A vault already exists on this server.";
      case "too_many_attempts":
        return "Too many unlock attempts. Wait a minute and try again.";
      case "session_required":
        return "Your session expired. Unlock again to continue.";
      case "revision_conflict":
        return "Someone else changed this record. Reload and try again.";
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function useWorkspace(): Workspace {
  const [status, setStatus] = useState<VaultStatus | undefined>(undefined);
  const [csrf, setCsrf] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const next = await api.status();
      setStatus(next);
      if (next.state !== "unlocked") {
        setCsrf(undefined);
        return;
      }
      // The vault is open, so the session cookie still is too: resume the CSRF
      // token instead of asking for the passphrase again on every reload.
      const resumed = await api.session();
      setCsrf(resumed.csrfToken);
      setStatus(resumed.vault);
    } catch (cause) {
      // A missing session means the unlock screen, not a broken server.
      if (cause instanceof ApiError && cause.code === "session_required") setCsrf(undefined);
      setError(describe(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<{ csrfToken: string; vault: VaultStatus }>): Promise<boolean> => {
      setBusy(true);
      setError(undefined);
      try {
        const result = await action();
        setCsrf(result.csrfToken);
        setStatus(result.vault);
        return true;
      } catch (cause) {
        setError(describe(cause));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return {
    status,
    csrf,
    loading,
    error,
    busy,
    refresh,
    createVault: useCallback((passphrase: string) => run(() => api.createVault(passphrase)), [run]),
    unlock: useCallback((passphrase: string) => run(() => api.unlock(passphrase)), [run]),
    lock: useCallback(
      async (scope: "current" | "all") => {
        if (!csrf) return;
        setBusy(true);
        try {
          await api.lock(csrf, scope);
        } catch (cause) {
          setError(describe(cause));
        } finally {
          setBusy(false);
          await refresh();
        }
      },
      [csrf, refresh],
    ),
    changePassphrase: useCallback(
      async (current: string, next: string) => {
        if (!csrf) return false;
        setBusy(true);
        setError(undefined);
        try {
          await api.changePassphrase(csrf, current, next);
          return true;
        } catch (cause) {
          setError(describe(cause));
          return false;
        } finally {
          setBusy(false);
        }
      },
      [csrf],
    ),
    clearError: useCallback(() => setError(undefined), []),
  };
}

export function describeError(error: unknown): string {
  return describe(error);
}
