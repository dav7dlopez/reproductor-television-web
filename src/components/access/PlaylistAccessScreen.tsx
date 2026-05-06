"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { MonitorPlay, Plus } from "lucide-react";
import { AccessForms } from "@/components/access/AccessForms";
import { SavedProfiles } from "@/components/access/SavedProfiles";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useProfilesStore } from "@/store/useProfilesStore";
import { useSessionStore } from "@/store/useSessionStore";
import type { IPTVProfile, NewProfileInput } from "@/types/profile";

export function PlaylistAccessScreen() {
  const profiles = useProfilesStore((state) => state.profiles);
  const isLoading = useProfilesStore((state) => state.isLoading);
  const addProfile = useProfilesStore((state) => state.addProfile);
  const editProfile = useProfilesStore((state) => state.editProfile);
  const removeProfile = useProfilesStore((state) => state.removeProfile);
  const touchProfile = useProfilesStore((state) => state.touchProfile);
  const setActiveProfile = useSessionStore((state) => state.setActiveProfile);
  const [editingProfileId, setEditingProfileId] = useState<string | undefined>(undefined);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const editingProfile = profiles.find((profile) => profile.id === editingProfileId);

  async function handleAccess(input: NewProfileInput, shouldSave: boolean) {
    if (editingProfileId && shouldSave) {
      const updated = await editProfile(editingProfileId, input);
      if (updated) {
        setEditingProfileId(undefined);
        setShowCreateForm(false);
        setActiveProfile(updated);
      }
      return;
    }
    const profile = shouldSave ? await addProfile(input) : createEphemeralProfile(input);
    setEditingProfileId(undefined);
    setShowCreateForm(false);
    setActiveProfile(profile);
  }

  async function handleSelect(id: string) {
    setEditingProfileId(undefined);
    const profile = await touchProfile(id);
    if (profile) {
      setActiveProfile(profile);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-5 text-white light:text-slate-950 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-10%] top-[-15%] h-80 w-80 rounded-full bg-sky-500/30 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-96 w-96 rounded-full bg-cyan-400/18 blur-3xl" />
        <div className="absolute bottom-[-18%] left-[22%] h-[30rem] w-[30rem] rounded-full bg-blue-700/22 blur-3xl" />
      </div>

      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="glass-card grid h-11 w-11 place-items-center rounded-2xl">
            <MonitorPlay size={20} />
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-sky-200 light:text-sky-800">David TV</p>
            <p className="glass-muted text-xs">Disfruta desde donde quieras.</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <section className="mx-auto grid max-w-4xl gap-5 py-6 lg:py-10">
        <motion.div
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="text-center"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <motion.div
            className="group relative inline-flex touch-none px-6 py-2 overflow-visible"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 1.01 }}
          >
            <motion.h1
              animate={{ backgroundPosition: ["0% 50%", "100% 50%"] }}
              className="relative bg-[length:200%_200%] bg-gradient-to-r from-cyan-100 via-sky-200 to-blue-200 bg-clip-text text-4xl font-semibold tracking-[-0.03em] text-transparent drop-shadow-[0_10px_30px_rgba(56,189,248,0.2)] sm:text-5xl"
              whileHover={{ scale: 1.04, filter: "drop-shadow(0 0 18px rgba(125,211,252,0.42))" }}
              whileTap={{ scale: 1.03, filter: "drop-shadow(0 0 14px rgba(125,211,252,0.35))" }}
              transition={{ duration: 3.2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            >
              Bienvenido
            </motion.h1>
          </motion.div>
          <div className="mx-auto mt-2 h-px w-28 bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />
        </motion.div>

        <motion.div animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.35 }}>
          <SavedProfiles
            isLoading={isLoading}
            onDelete={removeProfile}
            onEdit={(id) => {
              setEditingProfileId(id);
              setShowCreateForm(true);
            }}
            onSelect={handleSelect}
            profiles={profiles}
          />
        </motion.div>

        <motion.div animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-3xl p-3" initial={{ opacity: 0, y: 16 }} transition={{ delay: 0.05, duration: 0.35 }}>
          <button
            className="glass-button inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
            onClick={() => {
              if (editingProfileId) {
                setEditingProfileId(undefined);
              }
              setShowCreateForm((value) => !value);
            }}
            type="button"
          >
            <Plus size={16} />
            {showCreateForm || editingProfile ? "Ocultar formulario" : "Añadir nuevo perfil"}
          </button>
        </motion.div>

        {(showCreateForm || Boolean(editingProfile)) ? (
          <motion.div animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 12 }} transition={{ duration: 0.3 }}>
            <AccessForms
              key={editingProfile?.id ?? "new-profile"}
              editingProfile={editingProfile}
              onAccess={handleAccess}
              onCancelEdit={() => {
                setEditingProfileId(undefined);
                setShowCreateForm(false);
              }}
            />
          </motion.div>
        ) : null}
      </section>
    </main>
  );
}

function createEphemeralProfile(input: NewProfileInput): IPTVProfile {
  const timestamp = new Date().toISOString();

  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: timestamp,
  };
}
