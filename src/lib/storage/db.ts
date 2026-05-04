import Dexie, { type Table } from "dexie";
import type { IPTVProfile } from "@/types/profile";

class IPTVWebDatabase extends Dexie {
  profiles!: Table<IPTVProfile, string>;

  constructor() {
    super("iptvweb-local-db");

    this.version(1).stores({
      profiles: "id, type, name, lastUsedAt, createdAt",
    });
  }
}

export const db = new IPTVWebDatabase();
