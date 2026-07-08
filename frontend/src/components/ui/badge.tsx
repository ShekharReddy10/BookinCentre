import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const colorMap: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  occupied: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  cleaning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  maintenance: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  blocked: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  reserved: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  checked_in: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  checked_out: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  no_show: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  pending: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export function Badge({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  const key = String(children).toLowerCase().replace(/\s+/g, "_");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        colorMap[key] || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        className
      )}
      {...props}
    >
      {String(children).replace(/_/g, " ")}
    </span>
  );
}
