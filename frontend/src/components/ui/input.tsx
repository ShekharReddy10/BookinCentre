import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-base outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 md:text-sm",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
