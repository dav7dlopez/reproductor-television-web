import { create } from "zustand";
import { createProfile, deleteProfile, getProfiles, markProfileAsUsed, updateProfile } from "@/lib/storage/profileStorage";
import type { IPTVProfile, NewProfileInput } from "@/types/profile";

interface ProfilesState {
  profiles: IPTVProfile[];
  isLoading: boolean;
  error?: string;
  loadProfiles: () => Promise<void>;
  addProfile: (input: NewProfileInput) => Promise<IPTVProfile>;
  editProfile: (id: string, input: NewProfileInput) => Promise<IPTVProfile | undefined>;
  removeProfile: (id: string) => Promise<void>;
  touchProfile: (id: string) => Promise<IPTVProfile | undefined>;
}

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  isLoading: false,
  error: undefined,
  loadProfiles: async () => {
    set({ isLoading: true, error: undefined });
    try {
      const profiles = await getProfiles();
      set({ profiles, isLoading: false });
    } catch {
      set({ error: "No se pudieron cargar los perfiles locales.", isLoading: false });
    }
  },
  addProfile: async (input) => {
    const profile = await createProfile(input);
    set({ profiles: [profile, ...get().profiles] });
    return profile;
  },
  editProfile: async (id, input) => {
    const profile = await updateProfile(id, input);
    await get().loadProfiles();
    return profile;
  },
  removeProfile: async (id) => {
    await deleteProfile(id);
    set({ profiles: get().profiles.filter((profile) => profile.id !== id) });
  },
  touchProfile: async (id) => {
    const profile = await markProfileAsUsed(id);
    await get().loadProfiles();
    return profile;
  },
}));
