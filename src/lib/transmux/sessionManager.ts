import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

export interface TransmuxSession {
  id: string;
  dir: string;
  inputUrl: string;
  playlistPath: string;
  createdAt: number;
  lastUsedAt: number;
  process: ChildProcessWithoutNullStreams;
  endedAt?: number;
  exitCode?: number | null;
  stderrTail: string;
}

const SESSION_TTL_MS = 20 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 90 * 1000;
const ROOT_DIR = join(tmpdir(), "iptvweb-transmux");

const globalStore = globalThis as typeof globalThis & {
  __iptvTransmuxSessions?: Map<string, TransmuxSession>;
  __iptvTransmuxCleanupStarted?: boolean;
};

const sessions = globalStore.__iptvTransmuxSessions ?? new Map<string, TransmuxSession>();
globalStore.__iptvTransmuxSessions = sessions;

if (!existsSync(ROOT_DIR)) {
  mkdirSync(ROOT_DIR, { recursive: true });
}

if (!globalStore.__iptvTransmuxCleanupStarted) {
  globalStore.__iptvTransmuxCleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
      if (now - session.lastUsedAt > SESSION_TTL_MS) {
        stopSession(id);
      }
    }
  }, CLEANUP_INTERVAL_MS).unref();
}

export function ensureFfmpegAvailable(): boolean {
  return Boolean(resolveFfmpegPath());
}

export function startSession(inputUrl: string): { id: string; playlistPath: string } {
  const ffmpegBinaryPath = resolveFfmpegPath();
  if (!ffmpegBinaryPath) {
    throw new Error("ffmpeg binary unavailable");
  }

  const id = createSessionId();
  const dir = resolve(ROOT_DIR, id);
  mkdirSync(dir, { recursive: true });
  const playlistPath = join(dir, "index.m3u8");

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-fflags",
    "nobuffer",
    "-i",
    inputUrl,
    "-map",
    "0:v:0?",
    "-map",
    "0:a:0?",
    "-c",
    "copy",
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "8",
    "-hls_flags",
    "delete_segments+append_list+omit_endlist+program_date_time",
    "-hls_segment_filename",
    join(dir, "seg_%06d.ts"),
    playlistPath,
  ];

  const process = spawn(ffmpegBinaryPath, args, { stdio: "pipe" });

  const session: TransmuxSession = {
    id,
    dir,
    inputUrl,
    playlistPath,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    process,
    stderrTail: "",
  };

  process.stderr.on("data", (chunk: Buffer | string) => {
    session.stderrTail = `${session.stderrTail}${String(chunk)}`.slice(-4000);
  });

  process.on("error", (error) => {
    session.stderrTail = `${session.stderrTail}\nspawn-error: ${error.message}`.slice(-4000);
    session.endedAt = Date.now();
    session.exitCode = -1;
  });

  process.on("exit", (code) => {
    session.endedAt = Date.now();
    session.exitCode = code;
  });

  sessions.set(id, session);
  return { id, playlistPath };
}

export function getSession(id: string): TransmuxSession | undefined {
  const session = sessions.get(id);
  if (!session) {
    return undefined;
  }
  session.lastUsedAt = Date.now();
  return session;
}

export function getSessionDebugInfo(id: string): { exists: boolean; ended: boolean; exitCode?: number | null; stderrTail?: string } {
  const session = sessions.get(id);
  if (!session) {
    return { exists: false, ended: true };
  }
  return {
    exists: true,
    ended: Boolean(session.endedAt),
    exitCode: session.exitCode,
    stderrTail: sanitizeStderr(session.stderrTail),
  };
}

export function stopSession(id: string): boolean {
  const session = sessions.get(id);
  if (!session) {
    return false;
  }

  sessions.delete(id);
  try {
    session.process.kill("SIGTERM");
  } catch {
    // no-op
  }
  try {
    rmSync(session.dir, { recursive: true, force: true });
  } catch {
    // no-op
  }
  return true;
}

export function listSessionFiles(id: string): string[] {
  const session = getSession(id);
  if (!session || !existsSync(session.dir)) {
    return [];
  }
  return readdirSync(session.dir);
}

export async function waitForPlaylist(id: string, timeoutMs = 8000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const session = sessions.get(id);
    if (!session) {
      return false;
    }
    if (session.endedAt) {
      return false;
    }
    try {
      const details = await stat(session.playlistPath);
      if (details.size > 0) {
        return true;
      }
    } catch {
      // Continue polling.
    }
    await delay(180);
  }
  return false;
}

export function openSessionFile(id: string, filename: string) {
  const session = getSession(id);
  if (!session) {
    return undefined;
  }
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return undefined;
  }
  const fullPath = resolve(session.dir, filename);
  if (!fullPath.startsWith(session.dir) || !existsSync(fullPath)) {
    return undefined;
  }
  return createReadStream(fullPath);
}

function createSessionId(): string {
  return `tmx_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

function resolveFfmpegPath(): string | null {
  if (!ffmpegPath) {
    return null;
  }

  if (existsSync(ffmpegPath)) {
    return ffmpegPath;
  }

  // In Next/Turbopack server bundles ffmpeg-static can point to a virtual "/ROOT" path.
  if (ffmpegPath.startsWith("/ROOT/")) {
    const fallback = resolve(process.cwd(), ffmpegPath.slice("/ROOT/".length));
    if (existsSync(fallback)) {
      return fallback;
    }
  }

  return null;
}

function sanitizeStderr(value: string): string {
  return value
    .replace(/(https?:\/\/)[^\s]+/gi, "$1••••")
    .replace(/(username=)[^&\s]+/gi, "$1••••")
    .replace(/(password=)[^&\s]+/gi, "$1••••")
    .slice(-1200);
}
