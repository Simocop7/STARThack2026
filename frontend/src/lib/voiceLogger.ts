/**
 * Structured logger for the voice pipeline.
 *
 * Each log entry is tagged with a category so you can filter in DevTools:
 *   [VOICE:recognition]  – SpeechRecognition lifecycle (start/stop/error/onend)
 *   [VOICE:transcript]   – Interim and final transcript events
 *   [VOICE:tts]          – TTS fetch and audio playback
 *   [VOICE:phase]        – Phase transitions (idle/listening/processing/speaking)
 *   [VOICE:timer]        – Silence / inactivity / max-duration timers
 *   [VOICE:session]      – Session ID bumps and stale-session guards
 *
 * In the browser console you can filter to a specific category with:
 *   [VOICE:tts]
 *
 * Enable the in-UI debug panel by appending ?voiceDebug=1 to the URL.
 */

export type VoiceLogCategory =
  | "recognition"
  | "transcript"
  | "tts"
  | "phase"
  | "timer"
  | "session";

export interface VoiceLogEntry {
  ts: number;
  category: VoiceLogCategory;
  event: string;
  detail?: string;
}

const MAX_ENTRIES = 200;

// Singleton ring buffer — shared across all voice components
const _entries: VoiceLogEntry[] = [];
const _listeners: Set<() => void> = new Set();

const COLORS: Record<VoiceLogCategory, string> = {
  recognition: "#6366f1",
  transcript:  "#0ea5e9",
  tts:         "#8b5cf6",
  phase:       "#10b981",
  timer:       "#f59e0b",
  session:     "#ec4899",
};

export function voiceLog(
  category: VoiceLogCategory,
  event: string,
  detail?: string,
): void {
  const entry: VoiceLogEntry = { ts: Date.now(), category, event, detail };

  // Trim ring buffer
  if (_entries.length >= MAX_ENTRIES) _entries.shift();
  _entries.push(entry);

  // Console output — always on so DevTools capture it without a flag
  const color = COLORS[category];
  const ts = new Date(entry.ts).toISOString().slice(11, 23); // HH:MM:SS.mmm
  if (detail) {
    console.log(`%c[VOICE:${category}] ${event}%c  ${detail}`, `color:${color};font-weight:bold`, "color:gray", `  @ ${ts}`);
  } else {
    console.log(`%c[VOICE:${category}] ${event}`, `color:${color};font-weight:bold`, `  @ ${ts}`);
  }

  _listeners.forEach((fn) => fn());
}

/** Subscribe to new log entries (for the debug panel). Returns an unsubscribe fn. */
export function subscribeVoiceLogs(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** Snapshot of all captured entries (newest last). */
export function getVoiceLogs(): readonly VoiceLogEntry[] {
  return _entries;
}

/** Clear log buffer (useful between test runs). */
export function clearVoiceLogs(): void {
  _entries.length = 0;
  _listeners.forEach((fn) => fn());
}

/** True if ?voiceDebug=1 is present in the URL. */
export function isVoiceDebugMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("voiceDebug") === "1";
  } catch {
    return false;
  }
}
