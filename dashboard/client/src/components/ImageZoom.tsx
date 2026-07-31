import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { zoomIn } from '../lib/motion';

export type ZoomImage = { src: string; alt: string };

export default function ImageZoom({
  src,
  alt,
  className,
  gallery,
  index,
}: {
  src: string;
  alt: string;
  className?: string;
  /** Sibling images for prev/next nav in the lightbox. Omit for single-image zoom. */
  gallery?: ZoomImage[];
  index?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(index ?? 0);
  const images = gallery ?? [{ src, alt }];

  useEffect(() => {
    if (open) setPos(index ?? 0);
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowRight') setPos((p) => (p + 1) % images.length);
      if (e.key === 'ArrowLeft') setPos((p) => (p - 1 + images.length) % images.length);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, images.length]);

  const current = images[pos];

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`${className ?? ''} cursor-zoom-in`}
        onClick={() => setOpen(true)}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setOpen(false)}
          >
            {images.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPos((p) => (p - 1 + images.length) % images.length);
                }}
                aria-label="Anterior"
                className="absolute left-4 text-3xl text-slate-300 hover:text-gold"
              >
                ‹
              </button>
            )}
            <motion.img
              key={pos}
              variants={zoomIn}
              initial="hidden"
              animate="show"
              exit="hidden"
              transition={{ duration: 0.15 }}
              src={current.src}
              alt={current.alt}
              className="max-h-full max-w-full cursor-zoom-out rounded object-contain"
            />
            {images.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPos((p) => (p + 1) % images.length);
                }}
                aria-label="Siguiente"
                className="absolute right-4 text-3xl text-slate-300 hover:text-gold"
              >
                ›
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
