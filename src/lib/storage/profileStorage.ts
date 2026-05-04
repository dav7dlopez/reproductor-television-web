import { db } from "@/lib/storage/db";
import type { IPTVProfile, NewProfileInput } from "@/types/profile";

const now = () => new Date().toISOString();

export async function getProfiles(): Promise<IPTVProfile[]> {
  return db.profiles.orderBy("lastUsedAt").reverse().toArray();
}

export async function createProfile(input: NewProfileInput): Promise<IPTVProfile> {
  const timestamp = now();
  const profile: IPTVProfile = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: timestamp,
  };

  await db.profiles.add(profile);
  return profile;
}

export async function deleteProfile(id: string): Promise<void> {
  await db.profiles.delete(id);
}

export async function markProfileAsUsed(id: string): Promise<IPTVProfile | undefined> {
  const lastUsedAt = now();
  await db.profiles.update(id, { lastUsedAt, updatedAt: lastUsedAt });
  return db.profiles.get(id);
}

export async function updateProfile(id: string, input: NewProfileInput): Promise<IPTVProfile | undefined> {
  const updatedAt = now();
  await db.profiles.update(id, {
    ...input,
    updatedAt,
  });
  return db.profiles.get(id);
}
