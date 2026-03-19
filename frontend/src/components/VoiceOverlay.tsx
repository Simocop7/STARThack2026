import { useEffect, useRef } from "react";

type OverlayPhase = "listening" | "processing" | "speaking" | "closing";

interface Props {
  active: boolean;
  phase: OverlayPhase;
  volumeLevel: number;
  interimTranscript: string;
  onClose: () => void;
}

export default function VoiceOverlay({
  active,
  phase,
  volumeLevel,
  interimTranscript,
  onClose,
}: Props) {
  const orbRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Bridge volume level to CSS custom property for listening state
  useEffect(() => {
    if (orbRef.current && phase === "listening") {
      orbRef.current.style.setProperty("--volume", volumeLevel.toFixed(3));
    }
  }, [volumeLevel, phase]);

  // Handle closing animation
  useEffect(() => {
    if (phase === "closing" && overlayRef.current) {
      const el = overlayRef.current;
      el.style.animation = "overlayFadeOut 400ms ease-out forwards";
    }
  }, [phase]);

  if (!active) return null;

  const orbClass =
    phase === "listening"
      ? "voice-orb-listening"
      : phase === "speaking"
        ? "voice-orb-speaking"
        : "voice-orb-processing";

  const statusText =
    phase === "listening"
      ? "Listening..."
      : phase === "processing"
        ? "Processing your request..."
        : phase === "speaking"
          ? "Silvio is speaking..."
          : "";

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ animation: "overlayFadeIn 300ms ease-out" }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-indigo-950/95 to-violet-950/95 backdrop-blur-sm" />

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-6 right-6 z-10 text-white/60 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Ambient pulse rings (listening only) */}
        {phase === "listening" && (
          <>
            <div
              className="absolute rounded-full border border-indigo-400/20"
              style={{
                width: 280,
                height: 280,
                animation: "ringPulse 2s ease-out infinite",
              }}
            />
            <div
              className="absolute rounded-full border border-violet-400/15"
              style={{
                width: 280,
                height: 280,
                animation: "ringPulse 2s ease-out infinite 0.7s",
              }}
            />
            <div
              className="absolute rounded-full border border-purple-400/10"
              style={{
                width: 280,
                height: 280,
                animation: "ringPulse 2s ease-out infinite 1.4s",
              }}
            />
          </>
        )}

        {/* Processing ring */}
        {phase === "processing" && (
          <div
            className="absolute rounded-full"
            style={{
              width: 270,
              height: 270,
              border: "3px solid transparent",
              borderTopColor: "rgba(139, 92, 246, 0.8)",
              borderRightColor: "rgba(99, 102, 241, 0.4)",
              animation: "processingRing 1.2s linear infinite",
            }}
          />
        )}

        {/* The Orb */}
        <div
          ref={orbRef}
          className={`w-60 h-60 rounded-full ${orbClass}`}
          style={{
            animation:
              phase === "listening"
                ? undefined
                : phase === "speaking"
                  ? undefined // handled by CSS class
                  : undefined,
            ...(phase === "listening" ? {} : {}),
          }}
        />

        {/* Status label */}
        <div className="flex flex-col items-center gap-3">
          <p className="text-lg font-medium text-white/90 tracking-wide">
            {statusText}
          </p>

          {/* Interim transcript */}
          {phase === "listening" && interimTranscript && (
            <p
              className="text-sm text-white/50 max-w-md text-center italic"
              style={{ animation: "transcriptIn 200ms ease-out" }}
            >
              "{interimTranscript}"
            </p>
          )}
        </div>
      </div>

      {/* Bottom hint */}
      {phase === "listening" && (
        <p className="absolute bottom-8 text-sm text-white/30">
          Speak your procurement request...
        </p>
      )}
    </div>
  );
}
