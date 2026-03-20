import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AppLoaderProps {
  title: string;
  sentences?: string[];
}

export function AppLoader({ title, sentences }: AppLoaderProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!sentences?.length) return;
    setIndex(0);
    const id = setInterval(() => setIndex((i) => (i + 1) % sentences.length), 2200);
    return () => clearInterval(id);
  }, [sentences]);

  return (
    <div className="fixed inset-0 md:left-56 flex items-center justify-center z-40 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col items-center gap-7 pointer-events-none"
      >
        {/* Luma spinner */}
        <div className="relative w-[65px] aspect-square">
          <span className="luma-span" />
          <span className="luma-span luma-span-delay" />
        </div>

        {/* Title + rotating sentence */}
        <div className="text-center space-y-2">
          <p className="text-base font-bold text-gray-800">{title}</p>
          {sentences?.length ? (
            <div className="h-5 relative overflow-hidden w-72">
              <AnimatePresence mode="wait">
                <motion.p
                  key={index}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="text-sm text-gray-500 absolute inset-x-0 text-center"
                >
                  {sentences[index]}
                </motion.p>
              </AnimatePresence>
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
