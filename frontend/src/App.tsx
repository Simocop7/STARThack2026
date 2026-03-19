import { useState } from "react";
import RoleSelection from "./components/RoleSelection";
import EmployeePortal from "./components/EmployeePortal";
import ProcurementPortal from "./components/ProcurementPortal";
import AppShell from "./components/AppShell";

type Role = "employee" | "office";
type OfficeView = "inbox" | "process";

export default function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [officeView, setOfficeView] = useState<OfficeView>("inbox");
  const [empKey, setEmpKey] = useState(0);

  if (!role) {
    return <RoleSelection onSelect={setRole} />;
  }

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
