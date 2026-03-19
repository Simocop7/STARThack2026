import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlusCircle, History, Inbox, PenLine,
  FileText, Settings, CircleUserRound,
  ChevronDown, Menu, X, LogOut, Building2,
} from "lucide-react";

type Role = "employee" | "office";
type OfficeView = "inbox" | "process";
type EmployeeView = "new-request" | "history";

interface AppShellProps {
  role: Role;
  employeeView: EmployeeView;
  officeView: OfficeView;
  /** Single navigation callback — sidebar drives all routing */
  onNavigate: (role: Role, view: string) => void;
  onSwitchRole: () => void;
  children: React.ReactNode;
}

// ── Individual nav item ─────────────────────────────────────────────
interface ItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, active, disabled, onClick }: ItemProps) {
  return (
    <motion.button
      onClick={disabled ? undefined : onClick}
      whileHover={!disabled && !active ? { x: 3 } : {}}
      transition={{ duration: 0.18 }}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-red-950/60 border-l-2 border-red-500 pl-[10px] text-white"
          : disabled
          ? "opacity-30 cursor-not-allowed text-white/40"
          : "text-white/60 hover:text-white hover:bg-white/5"
      }`}
    >
      <span className={`shrink-0 ${active ? "text-red-500" : ""}`}>{icon}</span>
      <span className="truncate">{label}</span>
      {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
      {disabled && (
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-white/20">
          soon
        </span>
      )}
    </motion.button>
  );
}

// ── Collapsible nav group ───────────────────────────────────────────
interface GroupProps {
  label: string;
  items: ItemProps[];
  defaultOpen?: boolean;
}

function NavGroup({ label, items, defaultOpen = true }: GroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 group"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-red-500/70 group-hover:text-red-500 transition-colors">
          {label}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-red-500/50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-0.5 pb-1">
              {items.map((item) => (
                <NavItem key={item.label} {...item} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sidebar content ─────────────────────────────────────────────────
function SidebarContent({
  role, employeeView, officeView, onNavigate, onSwitchRole,
}: Omit<AppShellProps, "children">) {
  const isEmployee = role === "employee";
  const isOffice   = role === "office";

  const employeeGroup: GroupProps = {
    label: "Employee",
    items: [
      {
        icon: <PlusCircle className="w-4 h-4" />,
        label: "Send Request",
        active: isEmployee && employeeView === "new-request",
        onClick: () => onNavigate("employee", "new-request"),
      },
      {
        icon: <History className="w-4 h-4" />,
        label: "Requests History",
        active: isEmployee && employeeView === "history",
        onClick: () => onNavigate("employee", "history"),
      },
    ],
  };

  const officeGroup: GroupProps = {
    label: "Office",
    items: [
      {
        icon: <Inbox className="w-4 h-4" />,
        label: "Inbox",
        active: isOffice && officeView === "inbox",
        onClick: () => onNavigate("office", "inbox"),
      },
      {
        icon: <PenLine className="w-4 h-4" />,
        label: "Write New Request",
        active: isOffice && officeView === "process",
        onClick: () => onNavigate("office", "process"),
      },
    ],
  };

  const generalGroup: GroupProps = {
    label: "General",
    items: [
      {
        icon: <FileText className="w-4 h-4" />,
        label: "Policies",
        disabled: true,
        onClick: () => {},
      },
      {
        icon: <Settings className="w-4 h-4" />,
        label: "Settings",
        disabled: true,
        onClick: () => {},
      },
    ],
  };

  return (
    <div className="flex flex-col h-full bg-black text-white">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center shadow-lg shadow-red-900/40">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-black text-white tracking-wide leading-none">SilvioIQ</p>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto space-y-3">
        <NavGroup {...employeeGroup} />
        {/* Red separator */}
        <div className="mx-3 h-px bg-red-900/40" />
        <NavGroup {...officeGroup} />
        <div className="mx-3 h-px bg-red-900/40" />
        <NavGroup {...generalGroup} />
      </nav>

      {/* Footer: fake user */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-white/5 cursor-default">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <CircleUserRound className="w-4 h-4 text-white/60" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-none truncate">Alex Morgan</p>
            <p className="text-[11px] text-white/40 mt-0.5 leading-none truncate">
              alex.morgan@chainiq.com
            </p>
          </div>
          <button
            onClick={onSwitchRole}
            title="Switch Role"
            className="shrink-0 text-white/30 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shell ───────────────────────────────────────────────────────────
export default function AppShell({
  role, employeeView, officeView, onNavigate, onSwitchRole, children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sidebarProps = { role, employeeView, officeView, onNavigate, onSwitchRole };

  const handleNavigate: typeof onNavigate = (r, v) => {
    setDrawerOpen(false);
    onNavigate(r, v);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-950">

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-white/10">
        <SidebarContent {...sidebarProps} onNavigate={handleNavigate} />
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 w-9 h-9 bg-black border border-white/10 text-white rounded-lg flex items-center justify-center shadow-lg"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 bg-black/70 z-40"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="md:hidden fixed left-0 top-0 h-full w-56 z-50 border-r border-white/10"
            >
              <button
                onClick={() => setDrawerOpen(false)}
                className="absolute top-4 right-3 w-6 h-6 rounded-md bg-white/10 flex items-center justify-center text-white"
              >
                <X className="w-3 h-3" />
              </button>
              <SidebarContent {...sidebarProps} onNavigate={handleNavigate} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
