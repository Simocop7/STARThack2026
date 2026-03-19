"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import { cn } from "@/lib/utils";

export type TaskStatus = "Completed" | "In Progress" | "Pending" | "Rejected";

export interface Task {
  id: number | string;
  task: string;
  category: string;
  status: TaskStatus;
  dueDate: string;
}

export interface TaskListProps {
  title?: string;
  tasks: Task[];
}

const StatusBadge = ({ status }: { status: TaskStatus }) => {
  const baseClasses =
    "px-2.5 py-0.5 text-xs font-semibold rounded-full border border-white/10";

  const statusClasses: Record<TaskStatus, string> = {
    Completed: "bg-emerald-100/10 text-emerald-300 border-emerald-200/20",
    "In Progress": "bg-amber-100/10 text-amber-300 border-amber-200/20",
    Pending: "bg-white/5 text-white/70 border-white/10",
    Rejected: "bg-red-100/10 text-red-300 border-red-200/20",
  };

  return <span className={cn(baseClasses, statusClasses[status])}>{status}</span>;
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 14 },
  },
};

export const TaskList = ({ title = "Task List", tasks }: TaskListProps) => {
  return (
    <div className="w-full rounded-lg border border-white/10 bg-black/20 p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-4 text-white">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <motion.thead
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <tr className="border-b border-white/10">
              <th scope="col" className="p-4 font-medium text-white/60 w-12">
                No
              </th>
              <th scope="col" className="p-4 font-medium text-white/60">
                Request
              </th>
              <th scope="col" className="p-4 font-medium text-white/60">
                Category
              </th>
              <th scope="col" className="p-4 font-medium text-white/60">
                Status
              </th>
              <th scope="col" className="p-4 font-medium text-white/60 text-right">
                Due Date
              </th>
            </tr>
          </motion.thead>

          <motion.tbody variants={containerVariants} initial="hidden" animate="visible">
            <AnimatePresence>
              {tasks.map((task, index) => (
                <motion.tr
                  key={task.id}
                  variants={itemVariants}
                  className="border-b border-white/10 last:border-none hover:bg-white/5"
                >
                  <td className="p-4 text-white/60">{index + 1}</td>
                  <td className="p-4 font-medium text-white/90">
                    {task.task}
                  </td>
                  <td className="p-4 text-white/70">{task.category}</td>
                  <td className="p-4">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="p-4 text-white/60 text-right">{task.dueDate}</td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </motion.tbody>
        </table>
      </div>
    </div>
  );
};

