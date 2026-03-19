import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { voiceLog } from "../lib/voiceLogger";

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } }; length: number };
  resultIndex: number;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

const LANG_MAP: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  de: "de-DE",
  es: "es-ES",
  pt: "pt-BR",
  it: "it-IT",
  ja: "ja-JP",
};

interface Props {
  language: string;
  onTranscript: (transcript: string) => void;
  onParsing: (parsing: boolean) => void;
  disabled?: boolean;
  /** Hide the inline UI (overlay handles visuals) but keep imperative ref working */
  hidden?: boolean;
  /** Called with interim transcript text as user speaks */
  onInterimChange?: (text: string) => void;
  /** Auto-stop after silence once user has spoken (for one-shot overlay mode) */
  autoStopOnSilence?: boolean;
  /** Called when actual listening state changes (true = mic active, false = mic stopped) */
  onListeningChange?: (listening: boolean) => void;
  /** Called when recognition ends with no transcript (e.g. no-speech timeout) — parent can restart */
  onEmptyEnd?: () => void;
}

export interface VoiceInputHandle {
  startListening: () => void;
  stopListening: () => void;
  isListening: boolean;
}

const VoiceInput = forwardRef<VoiceInputHandle, Props>(
  ({ language, onTranscript, onParsing, disabled, hidden, onInterimChange, autoStopOnSilence, onListeningChange, onEmptyEnd }, ref) => {
    const [listening, setListening] = useState(false);
    const [interim, setInterim] = useState("");
    const [supported, setSupported] = useState(true);
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
    const finalTranscriptRef = useRef("");
    const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTranscriptChangeRef = useRef<number>(0);
    const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inactivityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Session counter: prevents onend callbacks from stale sessions interfering
    const sessionIdRef = useRef(0);

    useEffect(() => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setSupported(false);
        voiceLog("recognition", "not supported", "SpeechRecognition API unavailable in this browser");
      } else {
        voiceLog("recognition", "supported", "SpeechRecognition API available");
      }
    }, []);

    const stopListening = useCallback(() => {
      voiceLog("recognition", "stopListening called");
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
        voiceLog("timer", "silence timer cleared");
      }
      if (maxDurationTimerRef.current) {
        clearTimeout(maxDurationTimerRef.current);
        maxDurationTimerRef.current = null;
        voiceLog("timer", "max-duration timer cleared");
      }
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
        voiceLog("timer", "inactivity timer cleared");
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } else {
        const transcript = finalTranscriptRef.current.trim();
        if (transcript) {
          voiceLog("transcript", "emitting transcript (no-recognition path)", `"${transcript.slice(0, 80)}"`);
          onTranscript(transcript);
        }
      }
      setListening(false);
      onListeningChange?.(false);
      setInterim("");
    }, [onTranscript, onListeningChange]);

    const startListening = useCallback((retryCount = 0) => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      // Clean up any lingering previous session — MUST cancel timers first
      // so they don't fire and kill the new session we're about to create
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (maxDurationTimerRef.current) {
        clearTimeout(maxDurationTimerRef.current);
        maxDurationTimerRef.current = null;
      }
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }

      const recognition = new SpeechRecognition();
      // In overlay mode (autoStopOnSilence), use non-continuous so browser
      // automatically stops after one utterance and fires onend
      recognition.continuous = !autoStopOnSilence;
      recognition.interimResults = true;
      recognition.lang = LANG_MAP[language] || "en-US";

      // Bump session so stale onend callbacks are ignored
      sessionIdRef.current += 1;
      const thisSession = sessionIdRef.current;
      voiceLog("session", `session started`, `id=${thisSession} lang=${recognition.lang} continuous=${recognition.continuous} autoStop=${autoStopOnSilence}`);

      finalTranscriptRef.current = "";
      lastTranscriptChangeRef.current = Date.now();

      let lastSeenTranscript = "";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        // Ignore events from a stale session
        if (thisSession !== sessionIdRef.current) {
          voiceLog("session", "stale onresult ignored", `stale=${thisSession} current=${sessionIdRef.current}`);
          return;
        }
        let interimText = "";
        let finalText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          const isFinal = (result as unknown as { isFinal: boolean }).isFinal;
          if (isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        if (finalText) {
          finalTranscriptRef.current += finalText;
          voiceLog("transcript", "final chunk", `"${finalText.slice(0, 100)}" → accumulated="${finalTranscriptRef.current.slice(0, 100)}"`);
        }
        if (interimText) {
          voiceLog("transcript", "interim", `"${interimText.slice(0, 100)}"`);
        }

        // Track when the transcript actually changes (for inactivity detection)
        const currentFullTranscript = finalTranscriptRef.current + interimText;
        if (currentFullTranscript !== lastSeenTranscript) {
          lastSeenTranscript = currentFullTranscript;
          lastTranscriptChangeRef.current = Date.now();
        }

        setInterim(interimText);
        onInterimChange?.(currentFullTranscript);

        // Auto-stop after silence: when we get a final result, start a timer.
        // If new speech arrives, the timer resets. If silence persists, stop.
        // NOTE: Do NOT null recognitionRef here — let onend handle cleanup.
        if (autoStopOnSilence && finalTranscriptRef.current.trim()) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            voiceLog("timer", "silence timer fired → stopping recognition");
            if (recognitionRef.current) {
              recognitionRef.current.stop();
            }
          }, 1500);
          voiceLog("timer", "silence timer (re)set", "1500ms");
        }
      };

      recognition.onerror = (event: { error: string }) => {
        if (thisSession !== sessionIdRef.current) {
          voiceLog("session", "stale onerror ignored", `stale=${thisSession} current=${sessionIdRef.current} error=${event.error}`);
          return;
        }
        if (event.error === "no-speech") {
          // "no-speech" is normal — browser fires onend after this, which handles cleanup.
          voiceLog("recognition", "error: no-speech", "browser will fire onend — not stopping manually");
          return;
        }
        if (event.error === "aborted") {
          // "aborted" happens when we programmatically stop — safe to ignore
          voiceLog("recognition", "error: aborted", "programmatic stop — ignoring");
          return;
        }
        voiceLog("recognition", `error: ${event.error}`, "calling stopListening");
        console.error("Speech recognition error:", event.error);
        stopListening();
      };

      recognition.onend = () => {
        // Ignore onend from a stale session (previous recognition that fired late)
        if (thisSession !== sessionIdRef.current) {
          voiceLog("session", "stale onend ignored", `stale=${thisSession} current=${sessionIdRef.current}`);
          return;
        }
        voiceLog("recognition", "onend fired", `final="${finalTranscriptRef.current.slice(0, 80)}" lastSeen="${lastSeenTranscript.slice(0, 80)}"`);

        // Clean up all timers since the session is ending
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
          voiceLog("timer", "silence timer cleared on onend");
        }
        if (maxDurationTimerRef.current) {
          clearTimeout(maxDurationTimerRef.current);
          maxDurationTimerRef.current = null;
          voiceLog("timer", "max-duration timer cleared on onend");
        }
        if (inactivityTimerRef.current) {
          clearInterval(inactivityTimerRef.current);
          inactivityTimerRef.current = null;
          voiceLog("timer", "inactivity timer cleared on onend");
        }
        recognitionRef.current = null;

        setListening(false);
        onListeningChange?.(false);
        // Use final transcript, but fall back to interim if no final result arrived
        const transcript = finalTranscriptRef.current.trim() || lastSeenTranscript.trim();
        setInterim("");
        if (transcript) {
          voiceLog("transcript", "emitting final transcript", `"${transcript.slice(0, 100)}"`);
          onTranscript(transcript);
        } else {
          // No transcript captured (e.g. no-speech, background noise, mic cut off)
          voiceLog("transcript", "empty end — no transcript captured", "calling onEmptyEnd");
          onEmptyEnd?.();
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        voiceLog("recognition", "start() called", `session=${thisSession}`);
      } catch (err) {
        // Browser may not be ready (e.g. previous session still closing) — retry after delay
        if (retryCount < 3) {
          const delay = 300 + retryCount * 200; // 300, 500, 700ms
          voiceLog("recognition", `start() failed — retry ${retryCount + 1}/3`, `delay=${delay}ms err=${String(err)}`);
          setTimeout(() => startListening(retryCount + 1), delay);
        } else {
          voiceLog("recognition", "start() failed — max retries reached", String(err));
        }
        return;
      }
      setListening(true);
      onListeningChange?.(true);
      voiceLog("phase", "listening started");

      // Overlay mode: add safety-net timers that don't depend on isFinal
      if (autoStopOnSilence) {
        // Max duration: force-stop after 15s no matter what
        // NOTE: Do NOT null recognitionRef here — let onend handle cleanup.
        maxDurationTimerRef.current = setTimeout(() => {
          voiceLog("timer", "max-duration timer fired (15s) → stopping recognition");
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
        }, 15000);
        voiceLog("timer", "max-duration timer set", "15000ms");

        // Inactivity: stop if transcript hasn't changed for 3s
        // BUT only after the user has actually started speaking (has some transcript).
        // This prevents cutting off before the user begins talking.
        inactivityTimerRef.current = setInterval(() => {
          const hasSpoken = finalTranscriptRef.current.trim() || lastSeenTranscript.trim();
          if (!hasSpoken) return; // Don't timeout if user hasn't spoken yet
          const elapsed = Date.now() - lastTranscriptChangeRef.current;
          if (elapsed > 3000 && recognitionRef.current) {
            voiceLog("timer", "inactivity timer fired (3s silence after speech) → stopping recognition", `elapsed=${elapsed}ms`);
            recognitionRef.current.stop();
          }
        }, 500);
        voiceLog("timer", "inactivity timer set", "polls every 500ms, fires after 3000ms silence");
      }
    }, [language, onTranscript, onInterimChange, stopListening, autoStopOnSilence, onListeningChange, onEmptyEnd]);

    const toggleListening = useCallback(() => {
      if (listening) {
        stopListening();
      } else {
        startListening();
      }
    }, [listening, startListening, stopListening]);

    useImperativeHandle(ref, () => ({
      startListening,
      stopListening,
      isListening: listening,
    }), [startListening, stopListening, listening]);

    if (!supported || hidden) return null;

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={toggleListening}
            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-full font-medium text-sm transition-all ${
              listening
                ? "bg-red-500 text-white shadow-lg shadow-red-200 hover:bg-red-600"
                : "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {listening && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-400" />
              </span>
            )}
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              {listening ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              )}
            </svg>
            {listening ? "Stop" : "Voice Input"}
          </button>

          {listening && (
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5">
                <div className="w-1 bg-red-400 rounded-full animate-pulse" style={{ height: 12, animationDelay: "0ms" }} />
                <div className="w-1 bg-red-400 rounded-full animate-pulse" style={{ height: 18, animationDelay: "150ms" }} />
                <div className="w-1 bg-red-400 rounded-full animate-pulse" style={{ height: 10, animationDelay: "300ms" }} />
                <div className="w-1 bg-red-400 rounded-full animate-pulse" style={{ height: 16, animationDelay: "450ms" }} />
                <div className="w-1 bg-red-400 rounded-full animate-pulse" style={{ height: 12, animationDelay: "600ms" }} />
              </div>
              <span className="text-sm text-red-600 font-medium">Listening...</span>
            </div>
          )}
        </div>

        {interim && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500 italic">
            {interim}
          </div>
        )}
      </div>
    );
  }
);

VoiceInput.displayName = "VoiceInput";

export default VoiceInput;
