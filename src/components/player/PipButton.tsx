"use client";

import { PictureInPicture2 } from "lucide-react";

interface PipButtonProps {
  isActive: boolean;
  onToggle: () => void;
  className?: string;
}

export function PipButton({ className, isActive, onToggle }: PipButtonProps) {
  return (
    <button aria-label={isActive ? "Salir Picture-in-Picture" : "Picture-in-Picture"} className={className} onClick={onToggle} type="button">
      <PictureInPicture2 size={18} />
    </button>
  );
}
