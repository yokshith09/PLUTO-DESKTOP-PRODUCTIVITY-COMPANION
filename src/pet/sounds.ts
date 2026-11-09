import calm from "@/assets/sounds/calm.mp3";
import chord from "@/assets/sounds/chord.mp3";
import cloud from "@/assets/sounds/cloud.mp3";
import doorbell from "@/assets/sounds/doorbell.mp3";
import glass from "@/assets/sounds/glass.mp3";
import glisten from "@/assets/sounds/glisten.mp3";
import koto from "@/assets/sounds/koto.mp3";
import polite from "@/assets/sounds/polite.mp3";
import ponderous from "@/assets/sounds/ponderous.mp3";
import taptap from "@/assets/sounds/taptap.mp3";

/**
 * A-8 (owner 2026-11-09: "pick some open source sounds, good sounds like when Codex finishes"):
 * a short sound when an assistant is done, needs you, asks permission or hits an error, each its
 * own. CC0 sounds from akx/Notifications (see assets/sounds/LICENSE.md). Stored in the `pet.sounds`
 * preference; on by default, any kind can be set to no sound. Played by the pet window, so a
 * message the focus guard holds back makes no sound either.
 */
export const SOUNDS = {
  glass: { label: "Glass", src: glass },
  chord: { label: "Chord", src: chord },
  polite: { label: "Polite", src: polite },
  ponderous: { label: "Low knock", src: ponderous },
  glisten: { label: "Glisten", src: glisten },
  calm: { label: "Calm", src: calm },
  doorbell: { label: "Doorbell", src: doorbell },
  taptap: { label: "Tap tap", src: taptap },
  cloud: { label: "Cloud", src: cloud },
  koto: { label: "Koto", src: koto },
} as const;
export type SoundId = keyof typeof SOUNDS;
export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];

export const SOUND_KINDS = ["done", "needs", "permission", "error"] as const;
export type SoundKind = (typeof SOUND_KINDS)[number];
export const KIND_LABEL: Record<SoundKind, string> = { done: "Done", needs: "Needs you", permission: "Asks permission", error: "Hit an error" };

export const SOUNDS_PREF = "pet.sounds";
export interface SoundPrefs { on: boolean; volume: number; map: Record<SoundKind, SoundId | "none"> }
export const DEFAULT_SOUNDS: SoundPrefs = { on: true, volume: 0.6, map: { done: "glass", needs: "chord", permission: "polite", error: "ponderous" } };

export function parseSounds(raw: unknown): SoundPrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_SOUNDS;
  const r = raw as Record<string, unknown>;
  const v = typeof r.volume === "number" && Number.isFinite(r.volume) ? Math.min(1, Math.max(0, r.volume)) : DEFAULT_SOUNDS.volume;
  const m = (r.map && typeof r.map === "object" ? r.map : {}) as Record<string, unknown>;
  const map = { ...DEFAULT_SOUNDS.map };
  for (const k of SOUND_KINDS) {
    const id = m[k];
    if (id === "none" || (typeof id === "string" && id in SOUNDS)) map[k] = id as SoundId | "none";
  }
  return { on: r.on !== false, volume: v, map };
}

/** The file to play for a kind, or null for silence. */
export function soundFor(p: SoundPrefs, kind: string | undefined): string | null {
  if (!p.on || !kind || !(SOUND_KINDS as readonly string[]).includes(kind)) return null;
  const id = p.map[kind as SoundKind];
  return id === "none" ? null : SOUNDS[id].src;
}

/** Plays a file once; a webview that refuses to play stays silent rather than failing. */
export function play(src: string, volume: number): void {
  try {
    const a = new Audio(src);
    a.volume = volume;
    void a.play().catch(() => undefined);
  } catch {
    // no audio in this environment
  }
}
