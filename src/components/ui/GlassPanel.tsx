import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export function GlassPanel({ className, elevated = false, ...props }: GlassPanelProps) {
  return (
    <div
      className={clsx(
        "rounded-[2rem] border border-white/10 bg-white/[0.075] shadow-[0_24px_80px_rgba(2,8,23,0.34)] backdrop-blur-2xl light:border-slate-300/70 light:bg-white/70 light:shadow-[0_20px_80px_rgba(15,23,42,0.12)]",
        elevated && "shadow-[0_30px_110px_rgba(14,165,233,0.18)]",
        className,
      )}
      {...props}
    />
  );
}
