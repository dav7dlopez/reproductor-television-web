import { create } from "zustand";
import type { IPTVChannel } from "@/types/channel";
import type { PlaybackError, PlaybackStrategyPreference, PlayerStatus, ProxyHeaderProfile } from "@/types/player";

interface PlayerStoreState {
  channel?: IPTVChannel;
  status: PlayerStatus;
  error?: PlaybackError;
  muted: boolean;
  volume: number;
  isPiPAvailable: boolean;
  isPiPActive: boolean;
  strategyPreference: PlaybackStrategyPreference;
  useExperimentalProxy: boolean;
  proxyHeaderProfile: ProxyHeaderProfile;
  setChannel: (channel?: IPTVChannel) => void;
  setStatus: (status: PlayerStatus) => void;
  setError: (error?: PlaybackError) => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  setPiPAvailable: (available: boolean) => void;
  setPiPActive: (active: boolean) => void;
  setStrategyPreference: (strategy: PlaybackStrategyPreference) => void;
  setUseExperimentalProxy: (enabled: boolean) => void;
  setProxyHeaderProfile: (profile: ProxyHeaderProfile) => void;
  resetPlayer: () => void;
}

export const usePlayerStore = create<PlayerStoreState>((set) => ({
  channel: undefined,
  status: "idle",
  error: undefined,
  muted: false,
  volume: 0.85,
  isPiPAvailable: false,
  isPiPActive: false,
  strategyPreference: "force-transmux-proxy",
  useExperimentalProxy: true,
  proxyHeaderProfile: "iptv-smarters-like",
  setChannel: (channel) => set({ channel, status: channel ? "paused" : "idle", error: undefined, isPiPActive: false }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error, status: error ? "error" : "paused" }),
  setMuted: (muted) => set({ muted }),
  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
  setPiPAvailable: (isPiPAvailable) => set({ isPiPAvailable }),
  setPiPActive: (isPiPActive) => set({ isPiPActive }),
  setStrategyPreference: (strategyPreference) => set({ strategyPreference }),
  setUseExperimentalProxy: (useExperimentalProxy) => set({ useExperimentalProxy }),
  setProxyHeaderProfile: (proxyHeaderProfile) => set({ proxyHeaderProfile }),
  resetPlayer: () => set({ channel: undefined, status: "idle", error: undefined, isPiPActive: false }),
}));
