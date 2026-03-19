import { useState } from "react";
import RoleSelection from "./components/RoleSelection";
import EmployeePortal from "./components/EmployeePortal";
import ProcurementPortal from "./components/ProcurementPortal";

type Role = "employee" | "office";

export default function App() {
  const [role, setRole] = useState<Role | null>(null);

  if (!role) {
    return <RoleSelection onSelect={setRole} />;
  }

  if (role === "employee") {
    return <EmployeePortal onBack={() => setRole(null)} />;
  }

  return <ProcurementPortal onBack={() => setRole(null)} />;
}
