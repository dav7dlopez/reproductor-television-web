import { create } from "zustand";
import { writeSetting } from "@/lib/storage/settingsStorage";
import type { IPTVProfile } from "@/types/profile";

interface SessionState {
  activeProfile?: IPTVProfile;
  setActiveProfile: (profile: IPTVProfile) => void;
  clearActiveProfile: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  activeProfile: undefined,
  setActiveProfile: (profile) => {
    writeSetting("activeProfileId", profile.id);
    set({ activeProfile: profile });
  },
  clearActiveProfile: () => {
    writeSetting("activeProfileId", undefined);
    set({ activeProfile: undefined });
  },
}));
