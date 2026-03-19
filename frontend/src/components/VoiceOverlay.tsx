import { useEffect, useRef } from "react";
import { VoicePoweredOrb } from "./ui/voice-powered-orb";

type OverlayPhase = "listening" | "processing" | "speaking" | "closing";

interface Props {
  active: boolean;
  phase: OverlayPhase;
  volumeLevel: number;
  interimTranscript: string;
  onClose: () => void;
  onStopListening?: () => void;
}

export default function VoiceOverlay({
  active,
  phase,
  volumeLevel,
  interimTranscript,
  onClose,
  onStopListening,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const orbDivRef = useRef<HTMLDivElement>(null);
  const orbBtnRef = useRef<HTMLButtonElement>(null);

  // Closing animation
  useEffect(() => {
    if (phase === "closing" && overlayRef.current) {
      overlayRef.current.style.animation = "overlayFadeOut 400ms ease-out forwards";
    }
  }, [phase]);

  // Drive --volume CSS custom property for the glow effect
  useEffect(() => {
    const el = orbBtnRef.current ?? orbDivRef.current;
    if (el) el.style.setProperty("--volume", String(volumeLevel));
  }, [volumeLevel]);

  if (!active) return null;

  const statusText =
    phase === "listening" ? "Listening..."
    : phase === "processing" ? "Processing your request..."
    : phase === "speaking" ? "Silvio is speaking..."
    : "";

  const orbClass =
    phase === "listening" ? "voice-orb-listening"
    : phase === "processing" ? "voice-orb-processing"
    : phase === "speaking" ? "voice-orb-speaking"
    : "";

  const OrbInner = (
    <VoicePoweredOrb
      enableVoiceControl={phase === "listening"}
      externalVolumeLevel={phase === "listening" ? Math.max(0, Math.min(1, volumeLevel)) : 0}
      hue={0}
      className="w-full h-full"
    />
  );

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ animation: "overlayFadeIn 300ms ease-out" }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/95 via-red-950/85 to-black/95 backdrop-blur-sm" />

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

        {/* Listening: expanding pulse rings */}
        {phase === "listening" && (
          <>
            <div className="absolute rounded-full border border-red-400/25" style={{ width: 300, height: 300, animation: "ringPulse 2s ease-out infinite" }} />
            <div className="absolute rounded-full border border-red-400/15" style={{ width: 300, height: 300, animation: "ringPulse 2s ease-out infinite 0.7s" }} />
            <div className="absolute rounded-full border border-red-300/10" style={{ width: 300, height: 300, animation: "ringPulse 2s ease-out infinite 1.4s" }} />
          </>
        )}

        {/* Processing: spinning arc */}
        {phase === "processing" && (
          <>
            <div className="absolute rounded-full" style={{ width: 272, height: 272, border: "2px solid transparent", borderTopColor: "rgba(239,68,68,0.9)", borderRightColor: "rgba(220,38,38,0.3)", animation: "processingRing 1s linear infinite" }} />
            <div className="absolute rounded-full" style={{ width: 288, height: 288, border: "1px solid transparent", borderTopColor: "rgba(244,63,94,0.4)", animation: "processingRing 1.8s linear infinite reverse" }} />
          </>
        )}

        {/* Speaking: concentric breathe rings */}
        {phase === "speaking" && (
          <>
            <div className="absolute rounded-full border border-rose-400/30" style={{ width: 280, height: 280, animation: "ringPulse 1.4s ease-out infinite" }} />
            <div className="absolute rounded-full border border-red-300/20" style={{ width: 280, height: 280, animation: "ringPulse 1.4s ease-out infinite 0.5s" }} />
            <div className="absolute rounded-full border border-orange-300/15" style={{ width: 280, height: 280, animation: "ringPulse 1.4s ease-out infinite 0.9s" }} />
          </>
        )}

        {/* Orb wrapper — carries phase class for CSS-driven glow/scale */}
        {phase === "listening" && onStopListening ? (
          <button
            ref={orbBtnRef}
            type="button"
            onClick={onStopListening}
            title="Tap to finish"
            className={`w-60 h-60 rounded-full overflow-hidden cursor-pointer border-0 outline-none bg-black p-0 ${orbClass}`}
            style={{ "--volume": "0" } as React.CSSProperties}
          >
            {OrbInner}
          </button>
        ) : (
          <div
            ref={orbDivRef}
            className={`w-60 h-60 rounded-full overflow-hidden bg-black ${orbClass}`}
            style={{ "--volume": "0" } as React.CSSProperties}
          >
            {OrbInner}
          </div>
        )}

        {/* Status */}
        <div className="flex flex-col items-center gap-3">
          <p
            key={phase}
            className="text-lg font-medium text-white/90 tracking-wide"
            style={{ animation: "transcriptIn 300ms ease-out" }}
          >
            {statusText}
          </p>

          {phase === "processing" && (
            <div className="flex gap-1.5 items-center">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-red-400"
                  style={{ animation: `bounceDot 1.2s ease-in-out infinite ${i * 0.2}s` }}
                />
              ))}
            </div>
          )}

          {phase !== "closing" && interimTranscript && (
            <p
              className="text-sm text-white/50 max-w-md text-center italic"
              style={{ animation: "transcriptIn 200ms ease-out" }}
            >
              "{interimTranscript}"
            </p>
          )}
        </div>
      </div>

      {/* Done button (listening only) */}
      {phase === "listening" && onStopListening && (
        <button
          type="button"
          onClick={onStopListening}
          className="absolute bottom-20 z-10 flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium transition-all backdrop-blur-sm"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
          </svg>
          Done
        </button>
      )}

      {phase === "listening" && (
        <p className="absolute bottom-8 text-sm text-white/30">
          Speak, then tap the orb or press Done when finished
        </p>
      )}
    </div>
  );
}
