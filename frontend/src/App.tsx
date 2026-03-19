import { useState } from "react";
import HeroPage from "./components/HeroPage";
import RoleSelection from "./components/RoleSelection";
import EmployeePortal from "./components/EmployeePortal";
import ProcurementPortal from "./components/ProcurementPortal";
import AppShell from "./components/AppShell";

type Role = "employee" | "office";
type OfficeView = "inbox" | "process";

export default function App() {
  // Start on the hero; "Enter" jumps straight to employee portal
  const [showHero,  setShowHero]  = useState(true);
  const [role,      setRole]      = useState<Role | null>(null);
  const [officeView, setOfficeView] = useState<OfficeView>("inbox");
  const [empKey,    setEmpKey]    = useState(0);

  // ── Hero entry ──────────────────────────────────────────────────
  if (showHero) {
    return (
      <HeroPage
        onEnter={() => {
          setShowHero(false);
          setRole("employee");
        }}
      />
    );
  }

  // ── Role selection (shown after "Switch Role") ──────────────────
  if (!role) {
    return <RoleSelection onSelect={setRole} />;
  }

  // ── Portal views inside the sidebar shell ───────────────────────
  const handleSwitchRole = () => {
    setRole(null);
    setOfficeView("inbox");
  };

  return (
    <AppShell
      role={role}
      officeView={officeView}
      onSwitchRole={handleSwitchRole}
      onOfficeNav={(view) => setOfficeView(view)}
      onEmployeeNav={() => setEmpKey((k) => k + 1)}
    >
      {role === "employee" ? (
        <EmployeePortal key={empKey} onBack={handleSwitchRole} />
      ) : (
        <ProcurementPortal
          onBack={handleSwitchRole}
          externalPhase={officeView}
          onPhaseChange={setOfficeView}
        />
      )}
    </AppShell>
  );
}
