import { clsx } from "clsx";
import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helper?: string;
}

export function Input({ className, helper, id, label, ...props }: InputProps) {
  const inputId = id ?? props.name;

  return (
    <label className="grid gap-2 text-sm text-slate-200 light:text-slate-800" htmlFor={inputId}>
      <span className="font-medium">{label}</span>
      <input
        id={inputId}
        className={clsx(
          "glass-input h-12 rounded-2xl px-4 text-base backdrop-blur-xl",
          className,
        )}
        {...props}
      />
      {helper ? <span className="text-xs text-slate-400 light:text-slate-600">{helper}</span> : null}
    </label>
  );
}
