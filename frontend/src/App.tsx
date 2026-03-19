import { useState } from "react";
import HeroPage from "./components/HeroPage";
import EmployeePortal from "./components/EmployeePortal";
import EmployeeRequestsHistory from "./components/EmployeeRequestsHistory";
import ProcurementPortal from "./components/ProcurementPortal";
import AppShell from "./components/AppShell";
import VoiceDebugPanel from "./components/VoiceDebugPanel";
import { isVoiceDebugMode } from "./lib/voiceLogger";

type Role = "employee" | "office";
type OfficeView = "inbox" | "process" | "orders" | "policies";
type EmployeeView = "new-request" | "history";

export default function App() {
  const [showHero,   setShowHero]   = useState(true);
  const [role,       setRole]       = useState<Role>("employee");
  const [officeView, setOfficeView] = useState<OfficeView>("inbox");
  const [employeeView, setEmployeeView] = useState<EmployeeView>("new-request");
  const [empKey,     setEmpKey]     = useState(0);

  // ── Hero entry ──────────────────────────────────────────────────
  if (showHero) {
    return (
      <HeroPage onEnter={() => setShowHero(false)} />
    );
  }

  // ── Sidebar navigation handler ──────────────────────────────────
  const handleNavigate = (newRole: Role, view: string) => {
    setRole(newRole);
    if (newRole === "office") {
      setOfficeView(view as OfficeView);
    }
    if (newRole === "employee") {
      setEmployeeView(view as EmployeeView);
      if (view === "new-request") setEmpKey((k) => k + 1);
    }
  };

  const handleSwitchRole = () => setShowHero(true); // back to hero

  return (
    <>
      <AppShell
        role={role}
        employeeView={employeeView}
        officeView={officeView}
        onNavigate={handleNavigate}
        onSwitchRole={handleSwitchRole}
      >
        {role === "employee" ? (
          employeeView === "new-request" ? (
            <EmployeePortal key={empKey} onBack={() => handleSwitchRole()} />
          ) : (
            <EmployeeRequestsHistory />
          )
        ) : (
          <ProcurementPortal
            onBack={() => handleSwitchRole()}
            externalPhase={officeView}
            onPhaseChange={setOfficeView}
          />
        )}
      </AppShell>
      {isVoiceDebugMode() && <VoiceDebugPanel />}
    </>
  );
}
