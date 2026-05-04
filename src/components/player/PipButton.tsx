"use client";

import { PictureInPicture2 } from "lucide-react";

interface PipButtonProps {
  isActive: boolean;
  onToggle: () => void;
  className?: string;
}

export function PipButton({ className, isActive, onToggle }: PipButtonProps) {
  return (
    <button aria-label="Picture-in-Picture" className={className} onClick={onToggle} type="button">
      <PictureInPicture2 size={18} />
      <span className="hidden sm:inline">{isActive ? "Salir PiP" : "PiP"}</span>
    </button>
  );
}
