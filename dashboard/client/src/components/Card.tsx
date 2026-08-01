import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export default function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`rounded-lg border border-border bg-panel p-4 transition-colors hover:border-gold focus-visible:border-gold ${className}`}
    >
      {children}
    </motion.div>
  );
}
