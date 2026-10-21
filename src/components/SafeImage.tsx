import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Gamepad2 } from 'lucide-react';

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
const DEFAULT_GAMING_WALLPAPER = "/images/regenerated_image_1791755547255.png";

const OBJECT_FIT_MAP: Record<string, string> = {
  cover: 'object-cover',
  contain: 'object-contain',
  fill: 'object-fill',
  none: 'object-none',
  'scale-down': 'object-scale-down'
};

/**
 * Normalizes image paths to ensure instant loading & compatibility with:
 * - Vite dev & production builds
 * - Android WebView / APK (direct static assets)
 * - Mobile browsers & CDN caches
 * - Preserves real user-uploaded ImgBB URLs while replacing the known dead test URL
 */
export function normalizeImagePath(path?: string): string {
  if (!path) return DEFAULT_GAMING_WALLPAPER;
  const p = path.trim();
  if (!p) return DEFAULT_GAMING_WALLPAPER;

  // Fix only the specific dead ibb.co Free Fire test URL
  if (p.includes('i.ibb.co/v4v8Q5N/freefire.jpg')) {
    return DEFAULT_GAMING_WALLPAPER;
  }

  // Convert old /src/assets/images/ or src/assets/images/ to public /images/
  if (p.startsWith('/src/assets/images/')) {
    return '/images/' + p.slice('/src/assets/images/'.length);
  }
  if (p.startsWith('src/assets/images/')) {
    return '/images/' + p.slice('src/assets/images/'.length);
  }
  if (p.startsWith('src/assets/')) {
    return '/' + p;
  }
  if (p.startsWith('images/')) {
    return '/' + p;
  }
  return p;
}

export default function SafeImage({ 
  src, 
  alt = "Image", 
  className = "", 
  imgClassName = "",
  fallbackSrc,
  objectFit = 'cover',
  showLoader = true
}: SafeImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string>(() => normalizeImagePath(src));
  const [retryStage, setRetryStage] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const normalized = normalizeImagePath(src);
    setCurrentSrc(normalized);
    setHasError(false);
    setRetryStage(0);

    // Fast check: if the DOM node already has this image loaded
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
  }, [src]);

  // Check if image is already cached/complete immediately
  useEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setIsLoading(false);
    }
  }, [currentSrc]);

  // Network timeout watchdog (5s) to avoid staying in infinite loader state
  useEffect(() => {
    if (!isLoading || hasError) return;
    const timer = setTimeout(() => {
      if (imgRef.current && !imgRef.current.complete) {
        handleError();
      } else if (imgRef.current && imgRef.current.complete) {
        setIsLoading(false);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [isLoading, currentSrc, hasError]);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = () => {
    if (retryStage === 0) {
      // Step 1: try fallbackSrc or DEFAULT_GAMING_WALLPAPER
      const targetFallback = fallbackSrc ? normalizeImagePath(fallbackSrc) : DEFAULT_GAMING_WALLPAPER;
      if (currentSrc !== targetFallback) {
        setRetryStage(1);
        setCurrentSrc(targetFallback);
        return;
      }
      setRetryStage(1);
    }
    
    if (retryStage === 1) {
      // Step 2: try PRIMARY_LOGO
      if (currentSrc !== PRIMARY_LOGO) {
        setRetryStage(2);
        setCurrentSrc(PRIMARY_LOGO);
        return;
      }
      setRetryStage(2);
    }

    if (retryStage === 2) {
      // Step 3: try VECTOR_LOGO
      if (currentSrc !== VECTOR_LOGO) {
        setRetryStage(3);
        setCurrentSrc(VECTOR_LOGO);
        return;
      }
      setRetryStage(3);
    }

    // Final stage: Show fallback UI badge
    setHasError(true);
    setIsLoading(false);
  };

  const fitClass = OBJECT_FIT_MAP[objectFit] || 'object-cover';

  return (
    <div className={`relative overflow-hidden bg-neutral-900 ${className}`}>
      {/* Background / Placeholder during loading */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 bg-[#070e1e] flex flex-col items-center justify-center p-2 z-0">
          <img 
            src={VECTOR_LOGO} 
            alt="Loading Placeholder" 
            className="w-8 h-8 opacity-20 filter grayscale"
            loading="eager"
          />
          {showLoader && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
              <Loader2 className="text-cyan-400 animate-spin" size={16} />
            </div>
          )}
        </div>
      )}

      {/* Main Image */}
      {!hasError ? (
        <img
          ref={imgRef}
          key={currentSrc}
          src={currentSrc}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          decoding="async"
          className={`w-full h-full ${fitClass} transition-opacity duration-200 relative z-10 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          } ${imgClassName}`}
        />
      ) : (
        /* Ultimate graceful offline/missing UI */
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0c1427] to-[#050914] text-neutral-400 p-3 text-center z-10 relative">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-1">
            <Gamepad2 size={18} />
          </div>
          <span className="text-[9px] font-black uppercase tracking-wider text-neutral-300 line-clamp-1">
            {alt || 'SMART BATTLE'}
          </span>
        </div>
      )}
    </div>
  );
}
