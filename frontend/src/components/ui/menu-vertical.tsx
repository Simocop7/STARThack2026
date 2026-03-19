import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export type NavItem = {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
};

interface MenuVerticalProps {
  items: NavItem[];
  color?: string;
}

export function MenuVertical({ items, color = "#818cf8" }: MenuVerticalProps) {
  return (
    <div className="flex flex-col gap-1 w-full">
      {items.map((item, index) => (
        <motion.div
          key={index}
          className={`group/nav flex items-center gap-2 w-full cursor-pointer rounded-xl px-3 py-2.5 transition-colors ${
            item.active
              ? "bg-white/10 text-white"
              : item.disabled
              ? "opacity-40 cursor-not-allowed text-slate-400"
              : "text-slate-300 hover:text-white"
          }`}
          initial="initial"
          whileHover={item.disabled ? "initial" : "hover"}
          onClick={item.disabled ? undefined : item.onClick}
        >
          {/* Sliding arrow */}
          <motion.span
            variants={{
              initial: { x: "-120%", opacity: 0, color: "inherit" },
              hover: { x: 0, opacity: 1, color },
            }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="shrink-0"
          >
            <ArrowRight strokeWidth={3} className="w-4 h-4" />
          </motion.span>

          {/* Icon */}
          <span className={`shrink-0 w-5 flex items-center justify-center transition-colors ${
            item.active ? "text-white" : "text-slate-400 group-hover/nav:text-white"
          }`}>
            {item.icon}
          </span>

          {/* Label */}
          <motion.span
            variants={{
              initial: { x: -8, color: "inherit" },
              hover: { x: 0, color },
            }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="text-sm font-semibold truncate"
          >
            {item.label}
          </motion.span>

          {/* Active indicator */}
          {item.active && (
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
          )}
        </motion.div>
      ))}
    </div>
  );
}
