import { AppShell } from "./components/AppShell.js";
import { UnlockScreen } from "./components/UnlockScreen.js";
import { useWorkspace } from "./hooks/use-workspace.js";

export function App() {
  const workspace = useWorkspace();

  if (workspace.loading) {
    return (
      <div className="unlock-layout">
        <main className="unlock-card" aria-busy="true">
          <p className="muted" role="status">
            Checking the vault…
          </p>
        </main>
      </div>
    );
  }

  if (workspace.status?.state !== "unlocked" || !workspace.csrf) {
    return (
      <UnlockScreen
        status={workspace.status}
        busy={workspace.busy}
        error={workspace.error}
        onUnlock={workspace.unlock}
        onCreate={workspace.createVault}
        onClearError={workspace.clearError}
      />
    );
  }

  return (
    <AppShell
      csrf={workspace.csrf}
      status={workspace.status}
      busy={workspace.busy}
      error={workspace.error}
      onLock={workspace.lock}
      onChangePassphrase={workspace.changePassphrase}
      onClearError={workspace.clearError}
    />
  );
}
