import { useEffect, useState } from "react";
import type { VaultStatus } from "@flowly/web-contracts";
import { fetchVaultStatus } from "./api/vault-status.js";
import { LockedVaultShell } from "./components/LockedVaultShell.js";

export function App() {
  const [status, setStatus] = useState<VaultStatus | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    fetchVaultStatus(controller.signal)
      .then((value) => {
        setStatus(value);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? `Cannot reach the Flowly server: ${cause.message}`
            : "Cannot reach the Flowly server.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return <LockedVaultShell status={status} loading={loading} error={error} />;
}
