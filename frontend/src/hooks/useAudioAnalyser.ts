import { useEffect, useRef, useState } from "react";

export function useAudioAnalyser(active: boolean) {
  const [volumeLevel, setVolumeLevel] = useState(0);
  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const smoothedRef = useRef(0);

  useEffect(() => {
    if (!active) {
      // Clean up when deactivated
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (contextRef.current) {
        contextRef.current.close().catch(() => {});
        contextRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      smoothedRef.current = 0;
      setVolumeLevel(0);
      return;
    }

    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const ctx = new AudioContext();
        await ctx.resume();
        contextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function tick() {
          if (cancelled) return;
          analyser.getByteFrequencyData(dataArray);

          // Compute RMS average normalized to 0-1
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
          }
          const rms = Math.sqrt(sum / dataArray.length) / 255;

          // Exponential smoothing
          smoothedRef.current = smoothedRef.current * 0.7 + rms * 0.3;
          setVolumeLevel(smoothedRef.current);

          rafRef.current = requestAnimationFrame(tick);
        }

        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // Mic permission denied or unavailable — silently degrade
        setVolumeLevel(0);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (contextRef.current) {
        contextRef.current.close().catch(() => {});
        contextRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [active]);

  return volumeLevel;
}
