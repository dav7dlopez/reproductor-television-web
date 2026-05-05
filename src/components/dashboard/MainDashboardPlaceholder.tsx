"use client";

import { type Dispatch, type SetStateAction, useDeferredValue, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, MonitorPlay, Search, ShieldCheck, Star } from "lucide-react";
import { motion } from "framer-motion";
import { EpgPanel } from "@/components/epg/EpgPanel";
import { getCurrentProgram, getProgramProgress, formatProgramTime } from "@/lib/epg/epgUtils";
import { filterChannels } from "@/lib/playlist/groupChannels";
import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { IPTVPlayer } from "@/components/player/IPTVPlayer";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { getEpgProgramsForIptvChannel, useEpgStore } from "@/store/useEpgStore";
import { useFavoritesStore } from "@/store/useFavoritesStore";
import { usePlayerStore } from "@/store/usePlayerStore";
import { usePlaylistStore } from "@/store/usePlaylistStore";
import { useSessionStore } from "@/store/useSessionStore";
import type { IPTVChannel } from "@/types/channel";
type LeftPanelMode = "country" | "category" | "channels" | "favorites";
const CHANNELS_INITIAL_BATCH = 120;
const CHANNELS_BATCH_SIZE = 160;

export function MainDashboardPlaceholder() {
  const activeProfile = useSessionStore((state) => state.activeProfile);
  const clearActiveProfile = useSessionStore((state) => state.clearActiveProfile);
  const loadForProfile = usePlaylistStore((state) => state.loadForProfile);
  const playlistStatus = usePlaylistStore((state) => state.status);
  const playlistChannels = usePlaylistStore((state) => state.channels);
  const playlistSource = usePlaylistStore((state) => state.source);
  const selectedCountry = usePlaylistStore((state) => state.selectedCountry);
  const selectedCategory = usePlaylistStore((state) => state.selectedCategory);
  const searchQuery = usePlaylistStore((state) => state.searchQuery);
  const resetPlayer = usePlayerStore((state) => state.resetPlayer);
  const loadEpgForProfile = useEpgStore((state) => state.loadForProfile);
  const [isDesktop, setIsDesktop] = useState<boolean>(() => (typeof window === "undefined" ? true : window.matchMedia("(min-width: 1024px)").matches));

  useEffect(() => {
    if (activeProfile) {
      void loadForProfile(activeProfile);
    }
  }, [activeProfile, loadForProfile]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!activeProfile || playlistStatus !== "success" || playlistChannels.length === 0) {
      return;
    }
    const prioritized = filterChannels(playlistChannels, searchQuery, selectedCountry, selectedCategory)
      .slice(0, 80)
      .map((channel) => channel.id);
    void loadEpgForProfile(activeProfile, playlistChannels, playlistSource, { prioritizedChannelIds: prioritized });
  }, [activeProfile, loadEpgForProfile, playlistChannels, playlistSource, playlistStatus, searchQuery, selectedCategory, selectedCountry]);

  function handleExit() {
    resetPlayer();
    clearActiveProfile();
  }

  return (
    <main className="relative min-h-screen max-w-full overflow-x-hidden overflow-y-visible px-3 py-3 text-white light:text-slate-950 sm:px-5 lg:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/4 top-[-20%] h-[28rem] w-[28rem] rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute right-[-12%] top-1/3 h-[32rem] w-[32rem] rounded-full bg-blue-700/20 blur-3xl" />
      </div>

      <header className="mb-4 flex items-center justify-between gap-4 rounded-[1.8rem] border border-white/10 bg-white/[0.06] p-3 backdrop-blur-2xl light:border-slate-300/70 light:bg-white/70">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-300 text-slate-950 shadow-[0_16px_50px_rgba(56,189,248,0.22)]">
            <MonitorPlay size={20} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-slate-400 light:text-slate-500">Perfil activo · {activeProfile?.type === "m3u" ? "M3U" : "Xtream"}</p>
            <h1 className="truncate text-lg font-semibold sm:text-xl">{activeProfile?.name ?? "Perfil temporal"}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button onClick={handleExit} type="button" variant="ghost">Salir</Button>
        </div>
      </header>

      {isDesktop ? <DesktopDashboard /> : <MobileDashboard />}
    </main>
  );
}

function DesktopDashboard() {
  const activeProfile = useSessionStore((state) => state.activeProfile);
  const status = usePlaylistStore((state) => state.status);
  const error = usePlaylistStore((state) => state.error);
  const channels = usePlaylistStore((state) => state.channels);
  const groups = usePlaylistStore((state) => state.groups);
  const selectedChannel = usePlaylistStore((state) => state.selectedChannel);
  const selectedCountry = usePlaylistStore((state) => state.selectedCountry);
  const selectedCategory = usePlaylistStore((state) => state.selectedCategory);
  const searchQuery = usePlaylistStore((state) => state.searchQuery);
  const playlistDiagnostics = usePlaylistStore((state) => state.diagnostics);
  const setSearchQuery = usePlaylistStore((state) => state.setSearchQuery);
  const selectChannel = usePlaylistStore((state) => state.selectChannel);
  const setPlayerChannel = usePlayerStore((state) => state.setChannel);
  const setSelectedCountry = usePlaylistStore((state) => state.setSelectedCountry);
  const setSelectedCategory = usePlaylistStore((state) => state.setSelectedCategory);
  const [panelMode, setPanelMode] = useState<LeftPanelMode>("channels");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const favoritesByProfileId = useFavoritesStore((state) => state.byProfileId);
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);

  const selectedGroup = groups.find((group) => group.country === selectedCountry) ?? groups[0];
  const filteredChannels = useMemo(() => filterChannels(channels, deferredSearchQuery, selectedCountry, selectedCategory), [channels, deferredSearchQuery, selectedCategory, selectedCountry]);
  const favoriteChannels = useMemo(() => {
    if (!activeProfile?.id) {
      return [];
    }
    const favoriteEntries = favoritesByProfileId[activeProfile.id] ?? [];
    if (favoriteEntries.length === 0) {
      return [];
    }
    const ids = new Set(favoriteEntries.map((item) => item.id));
    return filteredChannels.filter((channel) => ids.has(`${channel.id}:${channel.sourceIndex}`));
  }, [activeProfile, favoritesByProfileId, filteredChannels]);
  const favoriteIdSet = useMemo(() => new Set(favoriteChannels.map((channel) => `${channel.id}:${channel.sourceIndex}`)), [favoriteChannels]);
  const channelsToRender = panelMode === "favorites" ? favoriteChannels : filteredChannels;
  const [visibleChannelsCount, setVisibleChannelsCount] = useProgressiveChannels();
  const visibleChannels = useMemo(() => channelsToRender.slice(0, visibleChannelsCount), [channelsToRender, visibleChannelsCount]);
  const epgProgramsByChannelId = useEpgStore((state) => state.programsByChannelId);
  const epgMatches = useEpgStore((state) => state.matchesByChannelId);
  const epgStatus = useEpgStore((state) => state.status);
  const epgError = useEpgStore((state) => state.error);
  const epgSource = useEpgStore((state) => state.source);
  const nowProgram = selectedChannel
    ? getCurrentProgram(getEpgProgramsForIptvChannel(selectedChannel.id, epgProgramsByChannelId, epgMatches))
    : undefined;

  return (
    <section className="hidden gap-4 lg:grid lg:grid-cols-[330px_minmax(0,1fr)_340px] xl:grid-cols-[360px_minmax(0,1fr)_360px]">
      <GlassPanel className="p-4 lg:max-h-[calc(100vh-7.3rem)] lg:overflow-hidden" elevated>
        <div className="mb-3 grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1 text-sm">
          <button className={`rounded-xl px-3 py-2 text-center ${panelMode === "favorites" ? "bg-amber-300/25 font-semibold text-amber-100" : "text-slate-400"}`} onClick={() => setPanelMode("favorites")} type="button">Favoritos</button>
          <button className={`rounded-xl px-3 py-2 text-center ${panelMode === "country" ? "bg-sky-300/25 font-semibold text-sky-100" : "text-slate-400"}`} onClick={() => setPanelMode("country")} type="button">País</button>
          <button className={`rounded-xl px-3 py-2 text-center ${panelMode === "category" ? "bg-sky-300/25 font-semibold text-sky-100" : "text-slate-400"}`} onClick={() => setPanelMode("category")} type="button">Categoría</button>
          <button className={`rounded-xl px-3 py-2 text-center ${panelMode === "channels" ? "bg-sky-300/25 font-semibold text-sky-100" : "text-slate-400"}`} onClick={() => setPanelMode("channels")} type="button">Canales</button>
        </div>
        <label className="relative mb-3 block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.07] pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-500 focus:border-sky-300/60 focus:ring-4 focus:ring-sky-300/10" onChange={(event) => { setSearchQuery(event.target.value); setPanelMode("channels"); }} placeholder="Buscar canal o programa" value={searchQuery} />
        </label>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {groups.map((group) => (
            <button className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${selectedCountry === group.country ? "bg-amber-300 text-slate-950" : "border border-white/10 bg-white/10 text-slate-200"}`} key={group.country} onClick={() => { setSelectedCountry(group.country); setPanelMode("category"); }} type="button">
              {group.country} · {group.totalChannels}
            </button>
          ))}
        </div>
        {process.env.NODE_ENV === "development" && playlistDiagnostics ? (
          <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-2 text-[11px] text-slate-300">
            <p>M3U método: {playlistDiagnostics.method}</p>
            <p>Fallback: {playlistDiagnostics.fallbackUsed ? "sí" : "no"}</p>
            <p>URL: {playlistDiagnostics.maskedUrl}</p>
            <p>Tamaño: {Math.round(playlistDiagnostics.playlistSize / 1024)} KB</p>
            <p>Canales parseados: {playlistDiagnostics.parsedChannels}</p>
          </div>
        ) : null}

        <div className="max-h-[calc(100vh-18rem)] space-y-3 overflow-auto pr-1">
          {status === "loading" ? <LoadingState compact /> : null}
          {status === "error" ? <ErrorState message={error} /> : null}
          {status === "success" && panelMode === "country" ? groups.map((group) => (
            <button className={`w-full rounded-2xl border px-3 py-3 text-left text-sm ${selectedCountry === group.country ? "border-amber-300/40 bg-amber-300/10 text-amber-100" : "border-white/10 bg-white/[0.03] text-slate-200"}`} key={group.country} onClick={() => { setSelectedCountry(group.country); setPanelMode("category"); }} type="button">
              {group.country} · {group.totalChannels} canales
            </button>
          )) : null}
          {status === "success" && panelMode === "category" ? selectedGroup?.categories.map((category) => (
            <button className={`w-full rounded-2xl border px-3 py-3 text-left text-sm ${selectedCategory === category.name ? "border-sky-300/40 bg-sky-300/10 text-sky-100" : "border-white/10 bg-white/[0.03] text-slate-200"}`} key={category.name} onClick={() => { setSelectedCategory(category.name); setPanelMode("channels"); }} type="button">
              {category.name} · {category.channels.length}
            </button>
          )) : null}
          {status === "success" && (panelMode === "channels" || panelMode === "favorites") ? visibleChannels.map((channel, index) => (
            <ChannelRow
              channel={channel}
              index={index}
              isFavorite={favoriteIdSet.has(`${channel.id}:${channel.sourceIndex}`)}
              epgMatches={epgMatches}
              epgProgramsByChannelId={epgProgramsByChannelId}
              epgStatus={epgStatus}
              onToggleFavorite={() => {
                if (activeProfile?.id) {
                  toggleFavorite(activeProfile.id, channel);
                }
              }}
              isSelected={selectedChannel?.id === channel.id}
              key={`${channel.id}-${channel.sourceIndex}`}
              onSelect={() => {
                selectChannel(channel);
                setPlayerChannel(channel);
                if (channel.country !== selectedCountry) {
                  setSelectedCountry(channel.country);
                }
                if (channel.category !== selectedCategory) {
                  setSelectedCategory(channel.category);
                }
              }}
            />
          )) : null}
          {status === "success" && (panelMode === "channels" || panelMode === "favorites") && visibleChannelsCount < channelsToRender.length ? (
            <button className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.08]" onClick={() => setVisibleChannelsCount((current) => Math.min(current + CHANNELS_BATCH_SIZE, channelsToRender.length))} type="button">
              Cargar más canales ({channelsToRender.length - visibleChannelsCount} restantes)
            </button>
          ) : null}
          {status === "success" && !selectedGroup ? <EmptyState /> : null}
          {status === "success" && panelMode === "channels" && filteredChannels.length === 0 ? <EmptyState /> : null}
          {status === "success" && panelMode === "favorites" && favoriteChannels.length === 0 ? <EmptyFavoritesState /> : null}
        </div>
      </GlassPanel>

      <div className="grid gap-4">
        <IPTVPlayer />
        <GlassPanel className="p-4" elevated><EpgPanel channel={selectedChannel} /></GlassPanel>
      </div>

      <GlassPanel className="p-4 lg:max-h-[calc(100vh-7.3rem)] lg:overflow-auto" elevated>
        <h2 className="mb-3 text-lg font-semibold">Información</h2>
        {selectedChannel ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <ChannelLogo channel={selectedChannel} size="large" />
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold">{selectedChannel.name}</h3>
                <p className="text-sm text-slate-400">{selectedChannel.country} · {selectedChannel.category}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Emitiendo ahora</p>
              <h4 className="mt-1 text-lg font-semibold">{nowProgram?.title ?? "Sin programación disponible"}</h4>
              <p className="text-sm text-slate-400">{nowProgram?.category ?? "Sin EPG asociada"}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>{nowProgram ? formatProgramTime(nowProgram.startMs) : "--:--"}</span>
                <span>{nowProgram ? formatProgramTime(nowProgram.stopMs) : "--:--"}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-amber-300" style={{ width: `${nowProgram ? Math.round(getProgramProgress(nowProgram) * 100) : 0}%` }} />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{nowProgram?.description ?? "Carga una URL EPG/XMLTV para ver la programación real de este canal."}</p>
            </div>
            <div className="rounded-2xl border border-sky-300/20 bg-sky-300/10 p-3 text-xs text-sky-100">
              EPG: {epgStatus === "loading" ? "Cargando..." : epgStatus === "error" ? epgError : epgSource?.maskedUrl ?? "no configurada"}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-400">Selecciona un canal en el panel izquierdo para ver información y EPG detallado.</div>
        )}
      </GlassPanel>
    </section>
  );
}

function MobileDashboard() {
  const activeProfile = useSessionStore((state) => state.activeProfile);
  const status = usePlaylistStore((state) => state.status);
  const error = usePlaylistStore((state) => state.error);
  const channels = usePlaylistStore((state) => state.channels);
  const groups = usePlaylistStore((state) => state.groups);
  const selectedChannel = usePlaylistStore((state) => state.selectedChannel);
  const selectedCountry = usePlaylistStore((state) => state.selectedCountry);
  const selectedCategory = usePlaylistStore((state) => state.selectedCategory);
  const searchQuery = usePlaylistStore((state) => state.searchQuery);
  const playlistDiagnostics = usePlaylistStore((state) => state.diagnostics);
  const setSearchQuery = usePlaylistStore((state) => state.setSearchQuery);
  const selectChannel = usePlaylistStore((state) => state.selectChannel);
  const setPlayerChannel = usePlayerStore((state) => state.setChannel);
  const setSelectedCountry = usePlaylistStore((state) => state.setSelectedCountry);
  const setSelectedCategory = usePlaylistStore((state) => state.setSelectedCategory);
  const [panelMode, setPanelMode] = useState<LeftPanelMode>("channels");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const favoritesByProfileId = useFavoritesStore((state) => state.byProfileId);
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);

  const selectedGroup = groups.find((group) => group.country === selectedCountry) ?? groups[0];
  const selectedCategoryGroup = selectedGroup?.categories.find((category) => category.name === selectedCategory) ?? selectedGroup?.categories[0];
  const filteredChannels = useMemo(() => filterChannels(channels, deferredSearchQuery, selectedCountry, selectedCategory), [channels, deferredSearchQuery, selectedCategory, selectedCountry]);
  const favoriteChannels = useMemo(() => {
    if (!activeProfile?.id) {
      return [];
    }
    const favoriteEntries = favoritesByProfileId[activeProfile.id] ?? [];
    if (favoriteEntries.length === 0) {
      return [];
    }
    const ids = new Set(favoriteEntries.map((item) => item.id));
    return filteredChannels.filter((channel) => ids.has(`${channel.id}:${channel.sourceIndex}`));
  }, [activeProfile, favoritesByProfileId, filteredChannels]);
  const favoriteIdSet = useMemo(() => new Set(favoriteChannels.map((channel) => `${channel.id}:${channel.sourceIndex}`)), [favoriteChannels]);
  const channelsToRender = panelMode === "favorites" ? favoriteChannels : filteredChannels;
  const [visibleChannelsCount, setVisibleChannelsCount] = useProgressiveChannels();
  const visibleChannels = useMemo(() => channelsToRender.slice(0, visibleChannelsCount), [channelsToRender, visibleChannelsCount]);
  const epgMatches = useEpgStore((state) => state.matchesByChannelId);
  const epgProgramsByChannelId = useEpgStore((state) => state.programsByChannelId);
  const epgStatus = useEpgStore((state) => state.status);
  const epgError = useEpgStore((state) => state.error);

  return (
    <section className="grid min-w-0 max-w-full gap-4 lg:hidden">
      <div className="sticky top-2 z-20 min-w-0 max-w-full">
        <IPTVPlayer />
      </div>

      <GlassPanel className="min-w-0 max-w-full overflow-x-hidden p-3">
        <div className="mb-3 grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1 text-xs">
          <button className={`rounded-xl px-3 py-2 text-center ${panelMode === "favorites" ? "bg-amber-300/20 font-semibold text-amber-200" : "text-slate-400"}`} onClick={() => setPanelMode("favorites")} type="button">Fav</button>
          <button className={`rounded-xl px-3 py-2 text-center ${panelMode === "country" ? "bg-amber-300/20 font-semibold text-amber-200" : "text-slate-400"}`} onClick={() => setPanelMode("country")} type="button">País</button>
          <button className={`rounded-xl px-3 py-2 text-center ${panelMode === "category" ? "bg-amber-300/20 font-semibold text-amber-200" : "text-slate-400"}`} onClick={() => setPanelMode("category")} type="button">Categoría</button>
          <button className={`rounded-xl px-3 py-2 text-center ${panelMode === "channels" ? "bg-amber-300/20 font-semibold text-amber-200" : "text-slate-400"}`} onClick={() => setPanelMode("channels")} type="button">Canales</button>
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {groups.map((group) => (
            <button className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${selectedCountry === group.country ? "bg-amber-300 text-slate-950" : "border border-white/10 bg-white/10 text-slate-200"}`} key={group.country} onClick={() => { setSelectedCountry(group.country); setPanelMode("category"); }} type="button">
              {group.country}
            </button>
          ))}
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {selectedGroup?.categories.map((category) => (
            <button className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${selectedCategory === category.name ? "bg-sky-300 text-slate-950" : "border border-white/10 bg-white/10 text-slate-200"}`} key={category.name} onClick={() => { setSelectedCategory(category.name); setPanelMode("channels"); }} type="button">
              {category.name}
            </button>
          ))}
        </div>

        <label className="relative mb-3 block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.07] pl-10 pr-4 text-sm outline-none" onChange={(event) => { setSearchQuery(event.target.value); setPanelMode("channels"); }} placeholder="Buscar canal" value={searchQuery} />
        </label>
        {process.env.NODE_ENV === "development" && playlistDiagnostics ? (
          <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-2 text-[11px] text-slate-300">
            <p>M3U método: {playlistDiagnostics.method}</p>
            <p>Fallback: {playlistDiagnostics.fallbackUsed ? "sí" : "no"}</p>
            <p>URL: {playlistDiagnostics.maskedUrl}</p>
            <p>Tamaño: {Math.round(playlistDiagnostics.playlistSize / 1024)} KB</p>
            <p>Canales parseados: {playlistDiagnostics.parsedChannels}</p>
          </div>
        ) : null}

        <div className="max-h-[48vh] space-y-2 overflow-auto pr-1">
          {status === "loading" ? <LoadingState compact /> : null}
          {status === "error" ? <ErrorState message={error} /> : null}
          {status === "success" && panelMode === "country" ? groups.map((group) => (
            <button className={`w-full rounded-2xl border px-3 py-2 text-left text-sm ${selectedCountry === group.country ? "border-amber-300/40 bg-amber-300/10 text-amber-100" : "border-white/10 bg-white/[0.03] text-slate-200"}`} key={group.country} onClick={() => { setSelectedCountry(group.country); setPanelMode("category"); }} type="button">
              {group.country} · {group.totalChannels}
            </button>
          )) : null}
          {status === "success" && panelMode === "category" ? selectedGroup?.categories.map((category) => (
            <button className={`w-full rounded-2xl border px-3 py-2 text-left text-sm ${selectedCategory === category.name ? "border-sky-300/40 bg-sky-300/10 text-sky-100" : "border-white/10 bg-white/[0.03] text-slate-200"}`} key={category.name} onClick={() => { setSelectedCategory(category.name); setPanelMode("channels"); }} type="button">
              {category.name} · {category.channels.length}
            </button>
          )) : null}
          {status === "success" && (panelMode === "channels" || panelMode === "favorites") ? visibleChannels.map((channel, index) => (
            <ChannelRow
              channel={channel}
              index={index}
              isFavorite={favoriteIdSet.has(`${channel.id}:${channel.sourceIndex}`)}
              epgMatches={epgMatches}
              epgProgramsByChannelId={epgProgramsByChannelId}
              epgStatus={epgStatus}
              onToggleFavorite={() => {
                if (activeProfile?.id) {
                  toggleFavorite(activeProfile.id, channel);
                }
              }}
              isSelected={selectedChannel?.id === channel.id}
              key={`${channel.id}-${channel.sourceIndex}`}
              onSelect={() => {
                selectChannel(channel);
                setPlayerChannel(channel);
                if (channel.country !== selectedCountry) {
                  setSelectedCountry(channel.country);
                }
                if (channel.category !== selectedCategoryGroup?.name) {
                  setSelectedCategory(channel.category);
                }
              }}
            />
          )) : null}
          {status === "success" && (panelMode === "channels" || panelMode === "favorites") && visibleChannelsCount < channelsToRender.length ? (
            <button className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.08]" onClick={() => setVisibleChannelsCount((current) => Math.min(current + CHANNELS_BATCH_SIZE, channelsToRender.length))} type="button">
              Cargar más canales ({channelsToRender.length - visibleChannelsCount} restantes)
            </button>
          ) : null}
          {status === "success" && panelMode === "channels" && filteredChannels.length === 0 ? <EmptyState /> : null}
          {status === "success" && panelMode === "favorites" && favoriteChannels.length === 0 ? <EmptyFavoritesState /> : null}
        </div>
      </GlassPanel>

      <GlassPanel className="min-w-0 max-w-full overflow-x-hidden p-3"><EpgPanel channel={selectedChannel} /></GlassPanel>

      <GlassPanel className="p-3">
        <div className="flex gap-3 text-xs text-cyan-100">
          <ShieldCheck className="mt-0.5 shrink-0" size={16} />
          <p>
            EPG estado: {epgStatus === "loading" ? "Cargando..." : epgStatus === "error" ? epgError : "Activa"} · canales con match:{" "}
            {Object.values(epgMatches).filter((match) => match.method !== "none").length}
          </p>
        </div>
      </GlassPanel>
    </section>
  );
}

function useProgressiveChannels(): [number, Dispatch<SetStateAction<number>>] {
  const [visibleChannelsCount, setVisibleChannelsCount] = useState(CHANNELS_INITIAL_BATCH);
  return [visibleChannelsCount, setVisibleChannelsCount];
}

function ChannelRow({
  channel,
  index,
  isSelected,
  isFavorite,
  onSelect,
  onToggleFavorite,
  epgProgramsByChannelId,
  epgMatches,
  epgStatus,
}: {
  channel: IPTVChannel;
  index: number;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  epgProgramsByChannelId: ReturnType<typeof useEpgStore.getState>["programsByChannelId"];
  epgMatches: ReturnType<typeof useEpgStore.getState>["matchesByChannelId"];
  epgStatus: ReturnType<typeof useEpgStore.getState>["status"];
}) {
  const programs = getEpgProgramsForIptvChannel(channel.id, epgProgramsByChannelId, epgMatches);
  const nowProgram = getCurrentProgram(programs);
  return (
    <motion.article animate={{ opacity: 1, y: 0 }} className={`rounded-2xl border p-3 transition ${isSelected ? "border-amber-300/60 bg-amber-300/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08]"}`} initial={{ opacity: 0, y: 8 }} transition={{ delay: Math.min(index * 0.015, 0.2) }}>
      <div
        className="w-full cursor-pointer text-left"
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-start gap-3">
          <ChannelLogo channel={channel} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate font-semibold">{channel.name}</h3>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-slate-400">{nowProgram ? `${formatProgramTime(nowProgram.startMs)} - ${formatProgramTime(nowProgram.stopMs)}` : "--:--"}</span>
                <button
                  aria-label={isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${isFavorite ? "border-amber-300/60 bg-amber-300/20 text-amber-200" : "border-white/15 bg-white/5 text-slate-400 hover:bg-white/10"}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleFavorite();
                  }}
                  type="button"
                >
                  <Star size={14} fill={isFavorite ? "currentColor" : "none"} />
                </button>
              </div>
            </div>
            <p className="truncate text-xs text-slate-400">{epgStatus === "loading" ? "Cargando EPG..." : nowProgram?.title ?? "Sin EPG"}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-amber-300" style={{ width: `${nowProgram ? Math.round(getProgramProgress(nowProgram) * 100) : 0}%` }} />
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function ChannelLogo({ channel, size = "normal" }: { channel?: IPTVChannel; size?: "normal" | "large" }) {
  const dimensions = size === "large" ? "h-16 w-16 sm:h-20 sm:w-20" : "h-11 w-11";

  if (channel?.logo) {
    return (
      <div
        aria-label={`Logo de ${channel.name}`}
        className={`${dimensions} shrink-0 rounded-2xl border border-white/10 bg-white/10 bg-contain bg-center bg-no-repeat p-2 light:bg-white/80`}
        role="img"
        style={{ backgroundImage: `url("${channel.logo}")` }}
      />
    );
  }

  return <div className={`${dimensions} grid shrink-0 place-items-center rounded-2xl bg-sky-300/20 text-sm font-bold text-sky-100 light:text-sky-800`}>TV</div>;
}

function LoadingState({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`grid place-items-center rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center ${compact ? "min-h-40" : "min-h-72"}`}>
      <div>
        <Loader2 className="mx-auto animate-spin text-sky-200" size={30} />
        <h3 className="mt-4 text-lg font-semibold">Cargando canales</h3>
        <p className="mt-2 max-w-md text-sm text-slate-400">Descargando y normalizando canales desde el perfil activo.</p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="rounded-3xl border border-rose-300/25 bg-rose-500/10 p-5 text-rose-50 light:text-rose-800">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 shrink-0" size={20} />
        <div>
          <h3 className="font-semibold">No se pudo cargar la playlist</h3>
          <p className="mt-2 text-sm leading-6 opacity-90">{message}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
      <h3 className="text-xl font-semibold">Sin canales para estos filtros</h3>
      <p className="mt-2 text-sm text-slate-400">Prueba con otro país, categoría o búsqueda.</p>
    </div>
  );
}

function EmptyFavoritesState() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
      <h3 className="text-xl font-semibold">Sin favoritos</h3>
      <p className="mt-2 text-sm text-slate-400">Marca canales con la estrella para tenerlos aquí.</p>
    </div>
  );
}
