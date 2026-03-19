import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Zap, Globe } from "lucide-react";
import { DotGlobeHero } from "./ui/globe-hero";

interface HeroPageProps {
  onEnter: () => void;
}

const STATS = [
  { value: "304", label: "Requests Processed" },
  { value: "151", label: "Verified Suppliers"  },
  { value: "40+",  label: "Countries Covered"  },
];

export default function HeroPage({ onEnter }: HeroPageProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <DotGlobeHero
      rotationSpeed={0.003}
      globeRadius={1.1}
      className="bg-black"
    >
      {/* Ambient red glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-red-700/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-red-900/8  rounded-full blur-3xl animate-pulse [animation-delay:1.5s]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center space-y-10 max-w-4xl mx-auto px-6 py-12">

        {/* Badge */}
        {mounted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-red-800/50 bg-red-950/30 backdrop-blur-sm"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">
              AI-Powered Procurement
            </span>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping [animation-delay:0.5s]" />
          </motion.div>
        )}

        {/* Title */}
        {mounted && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.2 }}
            className="space-y-2"
          >
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-none text-white uppercase">
              Chain
              <span className="relative inline-block">
                <span className="text-red-500">IQ</span>
                {/* underline bar */}
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 1, delay: 1, ease: "easeOut" }}
                  className="absolute -bottom-2 left-0 right-0 h-1 bg-red-500 rounded-full origin-left"
                />
              </span>
            </h1>
            <p className="text-lg md:text-xl font-semibold text-white/40 uppercase tracking-[0.25em]">
              Smart Sourcing. Zero Guesswork.
            </p>
          </motion.div>
        )}

        {/* Description */}
        {mounted && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="text-base md:text-lg text-white/50 leading-relaxed max-w-2xl mx-auto"
          >
            Convert unstructured purchase requests into{" "}
            <span className="text-white/80 font-semibold">
              structured, audit-ready supplier comparisons
            </span>{" "}
            — with transparent reasoning, policy enforcement, and automatic
            escalation logic.
          </motion.p>
        )}

        {/* Stat pills */}
        {mounted && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7 }}
            className="flex flex-wrap gap-4 justify-center"
          >
            {STATS.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-2.5 px-4 py-2 rounded-lg bg-white/5 border border-white/10"
              >
                <span className="text-xl font-black text-red-400">{s.value}</span>
                <span className="text-xs text-white/40 font-medium uppercase tracking-wide">
                  {s.label}
                </span>
              </div>
            ))}
          </motion.div>
        )}

        {/* Feature pills */}
        {mounted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            className="flex flex-wrap gap-3 justify-center"
          >
            {[
              { icon: <ShieldCheck className="w-3.5 h-3.5" />, text: "Policy Enforcement"  },
              { icon: <Zap          className="w-3.5 h-3.5" />, text: "Auto Escalation"     },
              { icon: <Globe        className="w-3.5 h-3.5" />, text: "40+ Countries"        },
            ].map(({ icon, text }) => (
              <span
                key={text}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/50"
              >
                <span className="text-red-500/80">{icon}</span>
                {text}
              </span>
            ))}
          </motion.div>
        )}

        {/* CTA */}
        {mounted && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.1 }}
            className="flex gap-4 justify-center"
          >
            <motion.button
              onClick={onEnter}
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="group relative inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-base overflow-hidden transition-colors duration-300 shadow-lg shadow-red-900/40"
            >
              {/* Shine sweep */}
              <motion.span
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                initial={{ x: "-100%" }}
                whileHover={{ x: "100%" }}
                transition={{ duration: 0.6 }}
              />
              <span className="relative z-10 uppercase tracking-widest text-sm font-black">Enter</span>
              <ArrowRight className="relative z-10 w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
            </motion.button>
          </motion.div>
        )}
      </div>

      {/* ChainIQ logo badge */}
      <div className="absolute top-6 left-8 z-20 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center text-white text-xs font-black shadow-lg shadow-red-900/40">
          C
        </div>
        <span className="text-white/50 text-sm font-bold tracking-widest uppercase">ChainIQ</span>
      </div>
    </DotGlobeHero>
  );
}
