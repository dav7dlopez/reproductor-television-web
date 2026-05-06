"use client";

import { CalendarClock, KeyRound, Link2, Pencil, Trash2 } from "lucide-react";
import { normalizeServerUrl } from "@/lib/xtream/xtreamUrls";
import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { IPTVProfile } from "@/types/profile";

interface SavedProfilesProps {
  profiles: IPTVProfile[];
  isLoading: boolean;
  onDelete: (id: string) => Promise<void>;
  onSelect: (id: string) => Promise<void>;
  onEdit: (id: string) => void;
}

export function SavedProfiles({ isLoading, onDelete, onEdit, onSelect, profiles }: SavedProfilesProps) {
  return (
    <GlassPanel className="max-h-[76vh] overflow-hidden p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200 light:text-sky-700">Perfiles locales</p>
          <h2 className="mt-2 text-2xl font-semibold text-white light:text-slate-950">Acceso rápido</h2>
        </div>
        <span className="glass-badge px-3 py-1 text-xs">{profiles.length}</span>
      </div>

      <div className="mt-4 grid max-h-[64vh] gap-2 overflow-auto pr-1">
        {isLoading ? <ProfileSkeleton /> : null}
        {!isLoading && profiles.length === 0 ? (
          <div className="glass-card rounded-3xl border-dashed p-5 text-sm text-slate-400 light:text-slate-600">
            Todavía no hay perfiles guardados. Crea uno y podrás entrar sin volver a escribir los datos.
          </div>
        ) : null}
        {profiles.map((profile) => (
          <article key={profile.id} className="glass-card rounded-2xl p-3 transition hover:border-sky-300/35 hover:bg-sky-300/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-sky-100 light:text-sky-800">
                  {profile.type === "m3u" ? <Link2 size={16} /> : <KeyRound size={16} />}
                  <span className="uppercase tracking-[0.18em]">{profile.type === "m3u" ? "M3U" : "Xtream"}</span>
                </div>
                <h3 className="mt-1 truncate text-base font-semibold text-white light:text-slate-950">{profile.name}</h3>
                <p className="mt-0.5 truncate text-xs text-slate-400 light:text-slate-500">{getProfileSubtitle(profile)}</p>
                {profile.lastUsedAt ? (
                  <p className="mt-3 flex items-center gap-2 text-xs text-slate-500 light:text-slate-500">
                    <CalendarClock size={14} /> Último uso: {new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" }).format(new Date(profile.lastUsedAt))}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                <button
                  aria-label={`Editar ${profile.name}`}
                  className="glass-button rounded-xl p-2 text-sky-100 light:text-sky-700"
                  onClick={() => onEdit(profile.id)}
                  type="button"
                >
                  <Pencil size={14} />
                </button>
                <button
                  aria-label={`Borrar ${profile.name}`}
                  className="rounded-xl border border-rose-300/20 bg-rose-500/10 p-2 text-rose-100 transition hover:bg-rose-500/20 light:text-rose-700"
                  onClick={() => onDelete(profile.id)}
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <Button className="mt-3 h-10 w-full text-sm" onClick={() => onSelect(profile.id)} type="button" variant="secondary">
              Usar este perfil
            </Button>
          </article>
        ))}
      </div>
    </GlassPanel>
  );
}

function ProfileSkeleton() {
  return (
    <div className="grid gap-3">
      {[0, 1].map((item) => (
        <div className="h-32 animate-pulse rounded-3xl border border-white/10 bg-white/10" key={item} />
      ))}
    </div>
  );
}


function getProfileSubtitle(profile: IPTVProfile): string | undefined {
  if (profile.type === "m3u") {
    return profile.m3uUrl;
  }

  return profile.xtream?.serverUrl ? normalizeServerUrl(profile.xtream.serverUrl) : undefined;
}
