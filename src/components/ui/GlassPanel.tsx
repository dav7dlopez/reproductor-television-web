import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export function GlassPanel({ className, elevated = false, ...props }: GlassPanelProps) {
  return (
    <div
      className={clsx(
        "glass-panel",
        elevated && "shadow-[0_26px_100px_rgba(14,165,233,0.2)]",
        className,
      )}
      {...props}
    />
  );
}
