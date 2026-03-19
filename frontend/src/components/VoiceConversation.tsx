import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";

type ConversationPhase = "idle" | "speaking" | "listening" | "processing";

interface Props {
  /** Text to speak via TTS (set when validation returns with issues or success) */
  textToSpeak: string | null;
  language: string;
  /** Whether voice mode is active */
  active: boolean;
  /** Called after TTS playback ends — parent should activate mic */
  onPlaybackEnd: () => void;
  /** Called when user clicks stop to exit voice conversation */
  onStop: () => void;
  /** Current phase override from parent (e.g. "listening", "processing") */
  externalPhase?: ConversationPhase;
  /** Hide the banner UI (overlay handles visuals) */
  hidden?: boolean;
  /** Called when TTS audio actually starts playing */
  onSpeakingStart?: () => void;
}

export default function VoiceConversation({
  textToSpeak,
  language,
  active,
  onPlaybackEnd,
  onStop,
  externalPhase,
  hidden,
  onSpeakingStart,
}: Props) {
  const [phase, setPhase] = useState<ConversationPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const i = t(language);

  // Sync phase with external overrides (listening, processing)
  useEffect(() => {
    if (externalPhase && externalPhase !== "speaking") {
      setPhase(externalPhase);
    }
  }, [externalPhase]);

  // When new text arrives and voice mode is active, play TTS
  useEffect(() => {
    if (!textToSpeak || !active) return;

    let cancelled = false;

    async function playTTS() {
      setPhase("speaking");
      setError(null);

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textToSpeak, language }),
        });

        if (!res.ok) {
          // TTS unavailable — fall back silently
          if (!cancelled) {
            setPhase("idle");
            onPlaybackEnd();
          }
          return;
        }

        const blob = await res.blob();
        if (cancelled) return;

        // Clean up previous blob URL
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }

        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          if (!cancelled) {
            setPhase("idle");
            onPlaybackEnd();
          }
        };

        audio.onerror = () => {
          if (!cancelled) {
            setError("Audio playback failed");
            setPhase("idle");
            onPlaybackEnd();
          }
        };

        await audio.play();
        if (!cancelled) onSpeakingStart?.();
      } catch {
        if (!cancelled) {
          setPhase("idle");
          onPlaybackEnd();
        }
      }
    }

    playTTS();

    return () => {
      cancelled = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [textToSpeak, active, language, onPlaybackEnd]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  const handleStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPhase("idle");
    onStop();
  }, [onStop]);

  // When hidden, still render (so hooks/effects run) but visually invisible
  if (!active) return null;
  if (hidden) return <div style={{ display: "none" }} />;

  const displayPhase = phase;

  return (
    <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Animated indicator */}
          {displayPhase === "speaking" && (
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                <div className="w-1.5 bg-violet-500 rounded-full animate-pulse" style={{ height: 14, animationDelay: "0ms" }} />
                <div className="w-1.5 bg-violet-500 rounded-full animate-pulse" style={{ height: 20, animationDelay: "100ms" }} />
                <div className="w-1.5 bg-violet-500 rounded-full animate-pulse" style={{ height: 12, animationDelay: "200ms" }} />
                <div className="w-1.5 bg-violet-500 rounded-full animate-pulse" style={{ height: 18, animationDelay: "300ms" }} />
                <div className="w-1.5 bg-violet-500 rounded-full animate-pulse" style={{ height: 14, animationDelay: "400ms" }} />
              </div>
              <span className="text-sm font-medium text-violet-700">
                {i.voiceSpeaking}
              </span>
            </div>
          )}

          {displayPhase === "listening" && (
            <div className="flex items-center gap-2">
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </div>
              <span className="text-sm font-medium text-green-700">
                {i.voiceListening}
              </span>
            </div>
          )}

          {displayPhase === "processing" && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
              <span className="text-sm font-medium text-violet-700">
                {i.voiceProcessing}
              </span>
            </div>
          )}

          {displayPhase === "idle" && (
            <span className="text-sm font-medium text-violet-600">
              {i.voiceConversationActive}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleStop}
          className="text-sm text-violet-600 hover:text-violet-800 font-medium px-3 py-1 rounded-md hover:bg-violet-100 transition-colors"
        >
          {i.voiceStop}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
