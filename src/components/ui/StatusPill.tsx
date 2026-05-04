import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

export function StatusPill({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs font-medium text-cyan-100 light:border-sky-500/20 light:bg-sky-100 light:text-sky-800",
        className,
      )}
      {...props}
    />
  );
}
