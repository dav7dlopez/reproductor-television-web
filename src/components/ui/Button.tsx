import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-sky-300/40 bg-sky-400/90 text-slate-950 shadow-[0_18px_50px_rgba(56,189,248,0.24)] hover:bg-cyan-300",
  secondary: "border-white/12 bg-white/10 text-white hover:bg-white/16 dark:text-white light:text-slate-950",
  ghost: "border-transparent bg-transparent text-slate-300 hover:bg-white/10 light:text-slate-600",
  danger: "border-rose-300/30 bg-rose-500/12 text-rose-100 hover:bg-rose-500/20 light:text-rose-700",
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
