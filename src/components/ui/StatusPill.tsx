import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

export function StatusPill({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "glass-badge px-3 py-1 text-xs font-medium",
        className,
      )}
      {...props}
    />
  );
}
