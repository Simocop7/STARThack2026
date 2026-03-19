import { useEffect, useRef, useState } from "react";
import {
  clearVoiceLogs,
  getVoiceLogs,
  subscribeVoiceLogs,
  type VoiceLogCategory,
  type VoiceLogEntry,
} from "../lib/voiceLogger";

const CATEGORY_COLORS: Record<VoiceLogCategory, string> = {
  recognition: "text-indigo-400",
  transcript:  "text-sky-400",
  tts:         "text-violet-400",
  phase:       "text-emerald-400",
  timer:       "text-amber-400",
  session:     "text-pink-400",
};

function fmt(ts: number): string {
  return new Date(ts).toISOString().slice(11, 23); // HH:MM:SS.mmm
}

export default function VoiceDebugPanel() {
  const [entries, setEntries] = useState<readonly VoiceLogEntry[]>(() => getVoiceLogs());
  const [filter, setFilter] = useState<VoiceLogCategory | "all">("all");
  const [pinToBottom, setPinToBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to live log updates
  useEffect(() => {
    return subscribeVoiceLogs(() => {
      setEntries([...getVoiceLogs()]);
    });
  }, []);

  // Auto-scroll when pinned
  useEffect(() => {
    if (pinToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, pinToBottom]);

  const visible = filter === "all" ? entries : entries.filter((e) => e.category === filter);

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] w-[480px] max-h-[380px] flex flex-col rounded-xl shadow-2xl border border-white/10 overflow-hidden"
      style={{ background: "#0d0d0d", fontFamily: "monospace" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5 shrink-0">
        <span className="text-xs font-bold text-white/80 uppercase tracking-wider">Voice Debug</span>
        <div className="flex items-center gap-2">
          {/* Category filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as VoiceLogCategory | "all")}
            className="text-xs bg-white/10 text-white/70 border border-white/10 rounded px-1 py-0.5 outline-none"
          >
            <option value="all">all</option>
            <option value="recognition">recognition</option>
            <option value="transcript">transcript</option>
            <option value="tts">tts</option>
            <option value="phase">phase</option>
            <option value="timer">timer</option>
            <option value="session">session</option>
          </select>
          {/* Pin toggle */}
          <button
            type="button"
            onClick={() => setPinToBottom((p) => !p)}
            title={pinToBottom ? "Unpin scroll" : "Pin to bottom"}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${pinToBottom ? "border-emerald-500 text-emerald-400" : "border-white/20 text-white/40"}`}
          >
            ↓
          </button>
          {/* Clear */}
          <button
            type="button"
            onClick={clearVoiceLogs}
            className="text-xs px-2 py-0.5 rounded border border-white/20 text-white/40 hover:text-white/80 hover:border-white/40 transition-colors"
          >
            clear
          </button>
        </div>
      </div>

      {/* Log list */}
      <div ref={scrollRef} className="overflow-y-auto flex-1 px-2 py-1">
        {visible.length === 0 ? (
          <p className="text-white/30 text-xs py-4 text-center">No voice events yet.</p>
        ) : (
          visible.map((entry, idx) => (
            <div key={idx} className="flex gap-2 py-0.5 text-xs leading-relaxed border-b border-white/5">
              <span className="text-white/30 shrink-0 w-[88px]">{fmt(entry.ts)}</span>
              <span className={`shrink-0 w-[84px] ${CATEGORY_COLORS[entry.category]}`}>{entry.category}</span>
              <span className="text-white/80 break-all">
                <span className="font-semibold">{entry.event}</span>
                {entry.detail && <span className="text-white/40">  {entry.detail}</span>}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer count */}
      <div className="px-3 py-1 border-t border-white/10 bg-white/5 shrink-0 text-xs text-white/30">
        {visible.length} / {entries.length} entries
      </div>
    </div>
  );
}
