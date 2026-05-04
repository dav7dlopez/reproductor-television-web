"use client";

import { FormEvent, useMemo, useState } from "react";
import { KeyRound, Link2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Input } from "@/components/ui/Input";
import type { NewProfileInput, ProfileType } from "@/types/profile";

interface AccessFormsProps {
  onAccess: (profile: NewProfileInput, shouldSave: boolean) => Promise<void>;
  editingProfile?: import("@/types/profile").IPTVProfile;
  onCancelEdit?: () => void;
}

interface M3UFormState {
  name: string;
  m3uUrl: string;
  epgUrl: string;
  shouldSave: boolean;
}

interface XtreamFormState {
  name: string;
  serverUrl: string;
  username: string;
  password: string;
  epgUrl: string;
  shouldSave: boolean;
}

const initialM3U: M3UFormState = {
  name: "",
  m3uUrl: "",
  epgUrl: "",
  shouldSave: true,
};

const initialXtream: XtreamFormState = {
  name: "",
  serverUrl: "",
  username: "",
  password: "",
  epgUrl: "",
  shouldSave: true,
};

export function AccessForms({ onAccess, editingProfile, onCancelEdit }: AccessFormsProps) {
  const initialM3UState = useMemo<M3UFormState>(() => {
    if (!editingProfile || editingProfile.type !== "m3u") {
      return initialM3U;
    }
    return {
      name: editingProfile.name,
      m3uUrl: editingProfile.m3uUrl ?? "",
      epgUrl: editingProfile.epgUrl ?? "",
      shouldSave: true,
    };
  }, [editingProfile]);
  const initialXtreamState = useMemo<XtreamFormState>(() => {
    if (!editingProfile || editingProfile.type !== "xtream") {
      return initialXtream;
    }
    return {
      name: editingProfile.name,
      serverUrl: editingProfile.xtream?.serverUrl ?? "",
      username: editingProfile.xtream?.username ?? "",
      password: editingProfile.xtream?.password ?? "",
      epgUrl: editingProfile.epgUrl ?? "",
      shouldSave: true,
    };
  }, [editingProfile]);
  const [activeType, setActiveType] = useState<ProfileType>(editingProfile?.type ?? "m3u");
  const [m3u, setM3u] = useState<M3UFormState>(initialM3UState);
  const [xtream, setXtream] = useState<XtreamFormState>(initialXtreamState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitM3U(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onAccess(
        {
          type: "m3u",
          name: m3u.name.trim(),
          m3uUrl: m3u.m3uUrl.trim(),
          epgUrl: m3u.epgUrl.trim() || undefined,
        },
        m3u.shouldSave,
      );
      setM3u(initialM3U);
      onCancelEdit?.();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitXtream(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onAccess(
        {
          type: "xtream",
          name: xtream.name.trim(),
          epgUrl: xtream.epgUrl.trim() || undefined,
          xtream: {
            serverUrl: xtream.serverUrl.trim(),
            username: xtream.username.trim(),
            password: xtream.password,
          },
        },
        xtream.shouldSave,
      );
      setXtream(initialXtream);
      onCancelEdit?.();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <GlassPanel className="overflow-hidden p-4 sm:p-6" elevated>
      <div className="grid grid-cols-2 gap-2 rounded-3xl border border-white/10 bg-slate-950/40 p-1 light:bg-slate-100/80">
        <button
          className={`flex items-center justify-center gap-2 rounded-[1.35rem] px-3 py-3 text-sm font-semibold transition ${
            activeType === "m3u"
              ? "bg-sky-300 text-slate-950 shadow-[0_12px_40px_rgba(56,189,248,0.28)]"
              : "text-slate-400 hover:text-white light:text-slate-500 light:hover:text-slate-950"
          }`}
          onClick={() => setActiveType("m3u")}
          type="button"
        >
          <Link2 size={18} /> M3U URL
        </button>
        <button
          className={`flex items-center justify-center gap-2 rounded-[1.35rem] px-3 py-3 text-sm font-semibold transition ${
            activeType === "xtream"
              ? "bg-sky-300 text-slate-950 shadow-[0_12px_40px_rgba(56,189,248,0.28)]"
              : "text-slate-400 hover:text-white light:text-slate-500 light:hover:text-slate-950"
          }`}
          onClick={() => setActiveType("xtream")}
          type="button"
        >
          <KeyRound size={18} /> Xtream Codes
        </button>
      </div>
      {editingProfile ? (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100 light:text-amber-800">
          <span>Editando perfil: {editingProfile.name}</span>
          <button className="rounded-lg border border-amber-300/30 px-2 py-1 text-xs" onClick={onCancelEdit} type="button">Cancelar</button>
        </div>
      ) : null}

      {activeType === "m3u" ? (
        <form className="mt-6 grid gap-4" onSubmit={submitM3U}>
          <Input label="Nombre del perfil" name="m3u-name" onChange={(event) => setM3u({ ...m3u, name: event.target.value })} placeholder="Casa, iPad, proveedor autorizado..." required value={m3u.name} />
          <Input label="URL M3U/M3U8" name="m3u-url" onChange={(event) => setM3u({ ...m3u, m3uUrl: event.target.value })} placeholder="https://proveedor-autorizado.com/playlist.m3u" required type="url" value={m3u.m3uUrl} />
          <Input helper="Opcional. Se usará en una fase posterior para XMLTV." label="URL EPG" name="m3u-epg" onChange={(event) => setM3u({ ...m3u, epgUrl: event.target.value })} placeholder="https://proveedor-autorizado.com/epg.xml" type="url" value={m3u.epgUrl} />
          <SaveCheckbox checked={m3u.shouldSave} onChange={(checked) => setM3u({ ...m3u, shouldSave: checked })} />
          <Button disabled={isSubmitting} type="submit">{editingProfile?.type === "m3u" ? "Guardar cambios" : "Entrar con M3U"}</Button>
        </form>
      ) : (
        <form className="mt-6 grid gap-4" onSubmit={submitXtream}>
          <Input label="Nombre del perfil" name="xtream-name" onChange={(event) => setXtream({ ...xtream, name: event.target.value })} placeholder="Proveedor autorizado" required value={xtream.name} />
          <Input label="Server URL" name="server-url" onChange={(event) => setXtream({ ...xtream, serverUrl: event.target.value })} placeholder="https://servidor-autorizado.com:8080" required type="url" value={xtream.serverUrl} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Username" name="username" onChange={(event) => setXtream({ ...xtream, username: event.target.value })} required value={xtream.username} />
            <Input label="Password" name="password" onChange={(event) => setXtream({ ...xtream, password: event.target.value })} required type="password" value={xtream.password} />
          </div>
          <Input helper="Opcional si tu proveedor ofrece XMLTV separado." label="URL EPG" name="xtream-epg" onChange={(event) => setXtream({ ...xtream, epgUrl: event.target.value })} placeholder="https://servidor-autorizado.com/xmltv.php?..." type="url" value={xtream.epgUrl} />
          <SaveCheckbox checked={xtream.shouldSave} onChange={(checked) => setXtream({ ...xtream, shouldSave: checked })} />
          <Button disabled={isSubmitting} type="submit">{editingProfile?.type === "xtream" ? "Guardar cambios" : "Entrar con Xtream"}</Button>
        </form>
      )}

      <div className="mt-5 flex gap-3 rounded-3xl border border-sky-300/15 bg-sky-300/10 p-4 text-sm text-cyan-50 light:bg-sky-50 light:text-sky-900">
        <ShieldCheck className="mt-0.5 shrink-0" size={18} />
        <p>Los perfiles se guardan solo en este dispositivo. Las credenciales no se envían a ningún servidor propio.</p>
      </div>
    </GlassPanel>
  );
}

function SaveCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-slate-200 light:border-slate-300/70 light:bg-white/70 light:text-slate-700">
      <input checked={checked} className="h-4 w-4 accent-sky-300" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      Guardar este perfil en este dispositivo
    </label>
  );
}
