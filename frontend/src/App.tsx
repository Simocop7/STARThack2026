import { useState } from "react";
import HeroPage from "./components/HeroPage";
import EmployeePortal from "./components/EmployeePortal";
import ProcurementPortal from "./components/ProcurementPortal";
import AppShell from "./components/AppShell";

type Role = "employee" | "office";
type OfficeView = "inbox" | "process";

export default function App() {
  const [showHero,   setShowHero]   = useState(true);
  const [role,       setRole]       = useState<Role>("employee");
  const [officeView, setOfficeView] = useState<OfficeView>("inbox");
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
    } else if (newRole === "employee" && view === "new-request") {
      setEmpKey((k) => k + 1);
    }
  };

  const handleSwitchRole = () => setShowHero(true); // back to hero

  return (
    <AppShell
      role={role}
      officeView={officeView}
      onNavigate={handleNavigate}
      onSwitchRole={handleSwitchRole}
    >
      {role === "employee" ? (
        <EmployeePortal key={empKey} onBack={() => handleSwitchRole()} />
      ) : (
        <ProcurementPortal
          onBack={() => handleSwitchRole()}
          externalPhase={officeView}
          onPhaseChange={setOfficeView}
        />
      )}
    </AppShell>
  );
}
