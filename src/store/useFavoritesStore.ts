import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { IPTVChannel } from "@/types/channel";

interface FavoriteEntry {
  id: string;
  channelId: string;
  sourceType?: IPTVChannel["sourceType"];
  name: string;
  logo?: string;
  country: string;
  category: string;
  sourceIndex: number;
  addedAt: string;
}

interface FavoritesState {
  byProfileId: Record<string, FavoriteEntry[]>;
  hydrated: boolean;
  markHydrated: () => void;
  toggleFavorite: (profileId: string, channel: IPTVChannel) => void;
  isFavorite: (profileId: string, channel: Pick<IPTVChannel, "id" | "sourceIndex">) => boolean;
  getFavoritesForProfile: (profileId?: string) => FavoriteEntry[];
  clearProfileFavorites: (profileId: string) => void;
}

function createEntry(channel: IPTVChannel): FavoriteEntry {
  return {
    id: `${channel.id}:${channel.sourceIndex}`,
    channelId: channel.id,
    sourceType: channel.sourceType,
    name: channel.name,
    logo: channel.logo,
    country: channel.country,
    category: channel.category,
    sourceIndex: channel.sourceIndex,
    addedAt: new Date().toISOString(),
  };
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      byProfileId: {},
      hydrated: false,
      markHydrated: () => set({ hydrated: true }),
      toggleFavorite: (profileId, channel) =>
        set((state) => {
          const current = state.byProfileId[profileId] ?? [];
          const entryId = `${channel.id}:${channel.sourceIndex}`;
          const exists = current.some((item) => item.id === entryId);
          const next = exists ? current.filter((item) => item.id !== entryId) : [createEntry(channel), ...current];
          return {
            byProfileId: {
              ...state.byProfileId,
              [profileId]: next,
            },
          };
        }),
      isFavorite: (profileId, channel) => {
        const current = get().byProfileId[profileId] ?? [];
        const entryId = `${channel.id}:${channel.sourceIndex}`;
        return current.some((item) => item.id === entryId);
      },
      getFavoritesForProfile: (profileId) => {
        if (!profileId) {
          return [];
        }
        return get().byProfileId[profileId] ?? [];
      },
      clearProfileFavorites: (profileId) =>
        set((state) => ({
          byProfileId: {
            ...state.byProfileId,
            [profileId]: [],
          },
        })),
    }),
    {
      name: "iptvweb.favorites",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);
