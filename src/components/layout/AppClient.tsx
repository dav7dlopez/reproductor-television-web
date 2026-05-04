"use client";

import { useEffect, useRef } from "react";
import { MainDashboardPlaceholder } from "@/components/dashboard/MainDashboardPlaceholder";
import { PlaylistAccessScreen } from "@/components/access/PlaylistAccessScreen";
import { readSettings } from "@/lib/storage/settingsStorage";
import { useProfilesStore } from "@/store/useProfilesStore";
import { useSessionStore } from "@/store/useSessionStore";
import { useSettingsStore } from "@/store/useSettingsStore";

export function AppClient() {
  const hasTriedRestore = useRef(false);
  const hydrateSettings = useSettingsStore((state) => state.hydrateSettings);
  const loadProfiles = useProfilesStore((state) => state.loadProfiles);
  const profiles = useProfilesStore((state) => state.profiles);
  const activeProfile = useSessionStore((state) => state.activeProfile);
  const setActiveProfile = useSessionStore((state) => state.setActiveProfile);

  useEffect(() => {
    hydrateSettings();
    void loadProfiles();
  }, [hydrateSettings, loadProfiles]);

  useEffect(() => {
    if (hasTriedRestore.current || activeProfile || profiles.length === 0) {
      return;
    }

    hasTriedRestore.current = true;
    const activeProfileId = readSettings().activeProfileId;
    const storedActiveProfile = profiles.find((profile) => profile.id === activeProfileId);

    if (storedActiveProfile) {
      setActiveProfile(storedActiveProfile);
    }
  }, [activeProfile, profiles, setActiveProfile]);

  return activeProfile ? <MainDashboardPlaceholder /> : <PlaylistAccessScreen />;
}
