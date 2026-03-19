import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox,
  PenLine,
  BarChart3,
  UserCircle2,
  ClipboardList,
  PlusCircle,
  LogOut,
  Menu,
  X,
  Building2,
} from "lucide-react";
import { MenuVertical, type NavItem } from "./ui/menu-vertical";

type Role = "employee" | "office";
type OfficeView = "inbox" | "process";

interface AppShellProps {
  role: Role;
  officeView: OfficeView;
  onSwitchRole: () => void;
  onOfficeNav: (view: OfficeView) => void;
  onEmployeeNav: (view: "new") => void;
  children: React.ReactNode;
}

const ROLE_META = {
  employee: { label: "Employee",          icon: "👤", color: "#60a5fa", badge: "bg-blue-500/20 text-blue-300"   },
  office:   { label: "Procurement Office", icon: "🏢", color: "#818cf8", badge: "bg-indigo-500/20 text-indigo-300" },
};

export default function AppShell({
  role,
  officeView,
  onSwitchRole,
  onOfficeNav,
  onEmployeeNav,
  children,
}: AppShellProps) {
  const [open, setOpen] = useState(false);
  const meta = ROLE_META[role];

  const officeItems: NavItem[] = [
    {
      label: "Inbox",
      icon: <Inbox className="w-4 h-4" />,
      active: officeView === "inbox",
      onClick: () => { onOfficeNav("inbox"); setOpen(false); },
    },
    {
      label: "New Manual Entry",
      icon: <PenLine className="w-4 h-4" />,
      active: officeView === "process",
      onClick: () => { onOfficeNav("process"); setOpen(false); },
    },
    {
      label: "Analytics",
      icon: <BarChart3 className="w-4 h-4" />,
      onClick: () => {},
      disabled: true,
    },
  ];

  const employeeItems: NavItem[] = [
    {
      label: "Submit Request",
      icon: <PlusCircle className="w-4 h-4" />,
      active: true,
      onClick: () => { onEmployeeNav("new"); setOpen(false); },
    },
    {
      label: "My Requests",
      icon: <ClipboardList className="w-4 h-4" />,
      onClick: () => {},
      disabled: true,
    },
  ];

  const items = role === "office" ? officeItems : employeeItems;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm shadow-indigo-900">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none">ChainIQ</p>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-none">Smart Procurement</p>
          </div>
        </div>
      </div>

      {/* Role badge */}
      <div className="px-4 py-3 border-b border-white/10">
        <div className={`flex items-center gap-2 text-xs font-semibold px-2.5 py-1.5 rounded-lg w-fit ${meta.badge}`}>
          <span>{meta.icon}</span>
          <span>{meta.label}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">
          Navigation
        </p>
        <MenuVertical items={items} color={meta.color} />
      </nav>

      {/* Bottom: switch role */}
      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        <motion.button
          whileHover={{ x: 4 }}
          transition={{ duration: 0.2 }}
          onClick={() => { onSwitchRole(); setOpen(false); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors text-sm font-medium"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Switch Role
        </motion.button>
        <div className="px-3 pt-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center">
              <UserCircle2 className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-300 leading-none">Demo User</p>
              <p className="text-[10px] text-slate-500 mt-0.5">user@chainiq.com</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 bg-slate-900 flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setOpen(false)}
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="md:hidden fixed left-0 top-0 h-full w-60 bg-slate-900 z-50 flex flex-col"
            >
              <button
                onClick={() => setOpen(false)}
                className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white"
              >
                <X className="w-4 h-4" />
              </button>
              <SidebarContent />
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
