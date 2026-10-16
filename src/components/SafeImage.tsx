import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Gamepad2, ShieldAlert } from 'lucide-react';

interface SafeImageProps {
  src?: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  fallbackSrc?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  showLoader?: boolean;
}

const PRIMARY_LOGO = "/logo.png";
const VECTOR_LOGO = "/logo.svg";

/**
 * Normalizes image paths to ensure compatibility with:
 * - Vite local dev server
 * - Production builds & custom domains
 * - Android WebView (where relative/absolute paths might be resolved differently)
 */
function normalizeImagePath(path?: string): string {
  if (!path) return PRIMARY_LOGO;
  // If it's a relative src/assets path, ensure leading slash
  if (path.startsWith('src/assets/')) return '/' + path;
  return path;
}

export default function SafeImage({ 
  src, 
  alt = "Image", 
  className = "", 
  imgClassName = "",
  fallbackSrc = PRIMARY_LOGO,
  objectFit = 'cover',
  showLoader = true
}: SafeImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [retryStage, setRetryStage] = useState(0); // 0: initial, 1: normalized/alt path, 2: fallback, 3: vector, 4: icon component
  const [currentSrc, setCurrentSrc] = useState<string>(() => normalizeImagePath(src));

  useEffect(() => {
    setIsLoading(true);
    setRetryStage(0);
    setCurrentSrc(normalizeImagePath(src));
  }, [src]);

  const handleError = () => {
    if (retryStage === 0) {
      // Step 1: If currentSrc has /src/assets/images/, try /images/
      if (currentSrc.includes('/src/assets/images/')) {
        const directPublicPath = currentSrc.replace('/src/assets/images/', '/images/');
        setRetryStage(1);
        setCurrentSrc(directPublicPath);
        return;
      }
      // If currentSrc is an external or custom url, try fallback
      setRetryStage(2);
      setCurrentSrc(fallbackSrc);
    } else if (retryStage === 1) {
      // Step 2: Try fallbackSrc
      setRetryStage(2);
      setCurrentSrc(fallbackSrc);
    } else if (retryStage === 2) {
      // Step 3: Try vector SVG logo
      setRetryStage(3);
      setCurrentSrc(VECTOR_LOGO);
    } else {
      // Step 4: Complete fallback to UI badge
      setRetryStage(4);
      setIsLoading(false);
    }
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  return (
    <div className={`relative overflow-hidden bg-neutral-900 ${className}`}>
      {/* Background / Placeholder during loading */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#090f1d] flex flex-col items-center justify-center p-2 z-0">
          <img 
            src={VECTOR_LOGO} 
            alt="Loading Placeholder" 
            className="w-10 h-10 opacity-15 filter grayscale"
            loading="lazy"
          />
          {showLoader && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs">
              <Loader2 className="text-cyan-400 animate-spin" size={18} />
            </div>
          )}
        </div>
      )}

      {/* Main Image or Fallback Component */}
      {retryStage < 4 ? (
        <AnimatePresence mode="wait">
          <motion.img
            key={currentSrc}
            src={currentSrc}
            alt={alt}
            initial={{ opacity: 0 }}
            animate={{ opacity: isLoading ? 0 : 1 }}
            transition={{ duration: 0.3 }}
            onLoad={handleLoad}
            onError={handleError}
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-${objectFit} relative z-10 ${imgClassName}`}
            referrerPolicy="no-referrer"
          />
        </AnimatePresence>
      ) : (
        /* Ultimate graceful offline/missing UI */
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0c1427] to-[#050914] text-neutral-400 p-3 text-center z-10 relative">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-1">
            <Gamepad2 size={20} />
          </div>
          <span className="text-[9px] font-black uppercase tracking-wider text-neutral-300 line-clamp-1">
            {alt || 'SMART BATTLE'}
          </span>
        </div>
      )}
    </div>
  );
}
