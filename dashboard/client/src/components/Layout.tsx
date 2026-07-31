import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import { useParallax } from '../lib/useParallax';

export default function Layout() {
  const location = useLocation();
  const blobOffsetA = useParallax(0.3);
  const blobOffsetB = useParallax(0.15);

  return (
    <div className="flex flex-col sm:flex-row">
      <Sidebar />
      <main className="relative min-h-screen flex-1 overflow-hidden bg-base p-4 sm:p-6">
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-gold/10 blur-3xl"
          style={{ transform: `translateY(${blobOffsetA}px)` }}
        />
        <div
          className="pointer-events-none absolute -right-32 top-64 h-[28rem] w-[28rem] rounded-full bg-cyan/10 blur-3xl"
          style={{ transform: `translateY(${blobOffsetB}px)` }}
        />
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
