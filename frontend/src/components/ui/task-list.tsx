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
    "px-2.5 py-0.5 text-xs font-semibold rounded-full border";

  const statusClasses: Record<TaskStatus, string> = {
    Completed:    "bg-emerald-50 text-emerald-700 border-emerald-200",
    "In Progress": "bg-amber-50 text-amber-700 border-amber-200",
    Pending:      "bg-gray-100 text-gray-600 border-gray-200",
    Rejected:     "bg-red-50 text-red-700 border-red-200",
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
    <div className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-4 text-gray-900">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <motion.thead
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <tr className="border-b border-gray-100">
              <th scope="col" className="p-4 font-medium text-gray-500 w-12">
                No
              </th>
              <th scope="col" className="p-4 font-medium text-gray-500">
                Request
              </th>
              <th scope="col" className="p-4 font-medium text-gray-500">
                Category
              </th>
              <th scope="col" className="p-4 font-medium text-gray-500">
                Status
              </th>
              <th scope="col" className="p-4 font-medium text-gray-500 text-right">
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
                  className="border-b border-gray-100 last:border-none hover:bg-gray-50"
                >
                  <td className="p-4 text-gray-400">{index + 1}</td>
                  <td className="p-4 font-medium text-gray-900">
                    {task.task}
                  </td>
                  <td className="p-4 text-gray-600">{task.category}</td>
                  <td className="p-4">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="p-4 text-gray-500 text-right">{task.dueDate}</td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </motion.tbody>
        </table>
      </div>
    </div>
  );
};

