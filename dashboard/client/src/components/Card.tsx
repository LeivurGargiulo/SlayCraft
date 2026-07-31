import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export default function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      whileHover={{ y: -2, borderColor: '#e8b339' }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`rounded-lg border border-border bg-panel p-4 ${className}`}
    >
      {children}
    </motion.div>
  );
}
