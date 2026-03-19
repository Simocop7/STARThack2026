import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

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
}

export interface VoiceInputHandle {
  startListening: () => void;
  stopListening: () => void;
  isListening: boolean;
}

const VoiceInput = forwardRef<VoiceInputHandle, Props>(
  ({ language, onTranscript, onParsing, disabled }, ref) => {
    const [listening, setListening] = useState(false);
    const [interim, setInterim] = useState("");
    const [supported, setSupported] = useState(true);
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
    const finalTranscriptRef = useRef("");

    useEffect(() => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setSupported(false);
      }
    }, []);

    const stopListening = useCallback(() => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setListening(false);
      setInterim("");
    }, []);

    const startListening = useCallback(() => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = LANG_MAP[language] || "en-US";

      finalTranscriptRef.current = "";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
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
        }
        setInterim(interimText);
      };

      recognition.onerror = (event: { error: string }) => {
        if (event.error !== "no-speech") {
          console.error("Speech recognition error:", event.error);
        }
        stopListening();
      };

      recognition.onend = () => {
        setListening(false);
        setInterim("");
        const transcript = finalTranscriptRef.current.trim();
        if (transcript) {
          onTranscript(transcript);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    }, [language, onTranscript, stopListening]);

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

    if (!supported) return null;

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
