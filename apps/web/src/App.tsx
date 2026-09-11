import { LockedVaultShell } from "./components/LockedVaultShell.js";
import { UnlockScreen } from "./components/UnlockScreen.js";
import { Workspace } from "./components/Workspace.js";
import { useWorkspace } from "./hooks/use-workspace.js";

export function App() {
  const workspace = useWorkspace();

  if (workspace.loading) {
    return <LockedVaultShell status={undefined} loading error={undefined} />;
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
    <Workspace
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
