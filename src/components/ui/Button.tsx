import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "glass-button-primary",
  secondary: "glass-button",
  ghost: "border-transparent bg-transparent text-slate-300 hover:bg-white/10 light:text-slate-700 light:hover:bg-slate-200/60",
  danger: "border-rose-300/30 bg-rose-500/14 text-rose-100 hover:bg-rose-500/20 light:border-rose-300/55 light:bg-rose-50 light:text-rose-700",
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/25 disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
