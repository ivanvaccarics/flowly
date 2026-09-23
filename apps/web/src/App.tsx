import { useState } from "react";
import { AppShell } from "./components/AppShell.js";
import { UnlockScreen } from "./components/UnlockScreen.js";
import { useWorkspace } from "./hooks/use-workspace.js";
import { BankCallbackView } from "./views/BankCallbackView.js";

const BANK_CALLBACK_PATH = "/enablebanking/auth_callback";

export function App() {
  const workspace = useWorkspace();
  const [path, setPath] = useState(() =>
    typeof window === "undefined" ? "/" : window.location.pathname,
  );
  const finishingBankAuthorization = path.startsWith(BANK_CALLBACK_PATH);

  const finishBankAuthorization = () => {
    window.history.replaceState({}, "", "/");
    setPath("/");
  };

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
        {...(finishingBankAuthorization
          ? { notice: "Unlock the vault to finish connecting your bank." }
          : {})}
      />
    );
  }

  if (finishingBankAuthorization) {
    return (
      <div className="shell">
        <main className="content">
          <BankCallbackView csrf={workspace.csrf} onFinished={finishBankAuthorization} />
        </main>
      </div>
    );
  }

  return (
    <AppShell
      csrf={workspace.csrf}
      busy={workspace.busy}
      error={workspace.error}
      onLock={workspace.lock}
      onChangePassphrase={workspace.changePassphrase}
      onClearError={workspace.clearError}
    />
  );
}
