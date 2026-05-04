"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSettingsStore } from "@/store/useSettingsStore";

export function ThemeToggle() {
  const theme = useSettingsStore((state) => state.theme);
  const toggleTheme = useSettingsStore((state) => state.toggleTheme);

  return (
    <Button aria-label="Cambiar tema" onClick={toggleTheme} type="button" variant="secondary">
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      <span className="hidden sm:inline">{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
    </Button>
  );
}
