import { clsx } from "clsx";
import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helper?: string;
}

export function Input({ className, helper, id, label, ...props }: InputProps) {
  const inputId = id ?? props.name;

  return (
    <label className="grid gap-2 text-sm text-slate-200 light:text-slate-700" htmlFor={inputId}>
      <span className="font-medium">{label}</span>
      <input
        id={inputId}
        className={clsx(
          "h-12 rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-base text-white outline-none backdrop-blur-xl transition placeholder:text-slate-500 focus:border-sky-300/70 focus:bg-sky-300/10 focus:ring-4 focus:ring-sky-400/10 light:border-slate-300/70 light:bg-white/75 light:text-slate-950 light:placeholder:text-slate-400",
          className,
        )}
        {...props}
      />
      {helper ? <span className="text-xs text-slate-400 light:text-slate-500">{helper}</span> : null}
    </label>
  );
}
