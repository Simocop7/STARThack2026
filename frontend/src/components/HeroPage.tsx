import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import HeroFuturistic from "./ui/hero-futuristic";

interface HeroPageProps {
  onEnter: () => void;
}

export default function HeroPage({ onEnter }: HeroPageProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen bg-black">
      <HeroFuturistic />

      {mounted && (
        <div className="hero-enter-wrap">
          <motion.button
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            onClick={onEnter}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="hero-enter-btn"
          >
            <span className="relative z-10 uppercase tracking-widest text-sm font-black">Enter</span>
            <span className="hero-arrow-icon relative z-10">
              <svg
                width="22"
                height="22"
                viewBox="0 0 22 22"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M11 5V17" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <path d="M6 12L11 17L16 12" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          </motion.button>
        </div>
      )}
    </div>
  );
}
