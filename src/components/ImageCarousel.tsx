import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { ReplacementRule } from '../types';
import { isImageMatchingRules, isGoogleNewsPlaceholder } from '../utils/rss';

interface ImageCarouselProps {
  images: string[];
  articleTitle: string;
  articleSummary?: string;
  showImages?: boolean;
  rules?: ReplacementRule[];
}

interface ImageMeta {
  url: string;
  width: number;
  height: number;
  area: number;
  aspectRatio: number;
  cleanKey: string;
}

// Extract normalized key from URL to detect lower/higher res variants of the same image
function getNormalizedImageKey(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove dimension query parameters like w=, width=, h=, height=, quality=, etc.
    ['w', 'width', 'h', 'height', 'quality', 'q', 'size', 'crop'].forEach((p) =>
      parsed.searchParams.delete(p)
    );
    // Strip dimension patterns from pathname e.g. /500/, /1000/, -150x150, -300x200
    let cleanPath = parsed.pathname
      .replace(/\/(?:\d{2,4}|\d{2,4}x\d{2,4})\//g, '/')
      .replace(/[-_]\d{2,4}x\d{2,4}(?=\.[a-z]{3,4})/gi, '');
    return `${parsed.hostname}${cleanPath}`;
  } catch {
    return url.replace(/[-_]\d{2,4}x\d{2,4}/gi, '');
  }
}

export const ImageCarousel: React.FC<ImageCarouselProps> = ({
  images,
  articleTitle,
  articleSummary = '',
  showImages = true,
  rules = [],
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [validImages, setValidImages] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState<boolean>(true);

  useEffect(() => {
    // Filter out generic placeholders and any images matching active citation anonymizer rules
    const allowedImages = (images || []).filter(
      (url) => !isGoogleNewsPlaceholder(url) && !isImageMatchingRules(url, rules)
    );

    if (!showImages || allowedImages.length === 0) {
      setValidImages([]);
      setIsChecking(false);
      return;
    }

    let isMounted = true;
    setIsChecking(true);

    const checkImages = async () => {
      const loadedMetas = await Promise.all(
        allowedImages.map((url) => {
          return new Promise<ImageMeta | null>((resolve) => {
            const img = new Image();
            img.src = url;
            img.onload = () => {
              const w = img.naturalWidth;
              const h = img.naturalHeight;
              // Reject obvious thumbnails, icons, and low-res images under 280x160 or under 50k total pixels
              if (w >= 280 && h >= 160 && w * h >= 50000) {
                const ratio = Math.round((w / h) * 100) / 100;
                resolve({
                  url,
                  width: w,
                  height: h,
                  area: w * h,
                  aspectRatio: ratio,
                  cleanKey: getNormalizedImageKey(url),
                });
              } else {
                resolve(null);
              }
            };
            img.onerror = () => {
              resolve(null);
            };
          });
        })
      );

      if (isMounted) {
        const validMetas = loadedMetas.filter((m): m is ImageMeta => m !== null);

        // Deduplicate: Group images by cleanKey or identical aspect ratio & domain
        const uniqueMetasMap = new Map<string, ImageMeta>();

        validMetas.forEach((meta) => {
          // Check if we already have a matching image variant by cleanKey or close aspect ratio
          let existingKey: string | null = null;

          for (const [key, existing] of uniqueMetasMap.entries()) {
            const isSameCleanKey = key === meta.cleanKey;
            const isSameRatio = Math.abs(existing.aspectRatio - meta.aspectRatio) < 0.04;
            const isSameDomain =
              meta.cleanKey.split('/')[0] === existing.cleanKey.split('/')[0];

            if (isSameCleanKey || (isSameRatio && isSameDomain)) {
              existingKey = key;
              break;
            }
          }

          if (existingKey) {
            const existing = uniqueMetasMap.get(existingKey)!;
            // Keep the higher resolution (larger area) variant
            if (meta.area > existing.area) {
              uniqueMetasMap.delete(existingKey);
              uniqueMetasMap.set(meta.cleanKey, meta);
            }
          } else {
            uniqueMetasMap.set(meta.cleanKey, meta);
          }
        });

        const sortedHighResUrls = Array.from(uniqueMetasMap.values())
          .sort((a, b) => b.area - a.area)
          .map((m) => m.url);

        setValidImages(sortedHighResUrls);
        setIsChecking(false);
      }
    };

    checkImages();

    return () => {
      isMounted = false;
    };
  }, [images, showImages, rules, articleTitle, articleSummary]);

  // Reset current index if validImages count changes
  useEffect(() => {
    if (currentIndex >= validImages.length) {
      setCurrentIndex(0);
    }
  }, [validImages, currentIndex]);

  if (!showImages || isChecking || validImages.length === 0) {
    return null;
  }

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === 0 ? validImages.length - 1 : prev - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === validImages.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="w-full md:w-56 lg:w-64 xl:w-72 flex-shrink-0 md:order-2 mb-3.5 md:mb-0">
      <div className="relative group rounded-xl overflow-hidden border border-slate-800 bg-slate-950/60 shadow-inner w-full">
        {/* Main Image Container enforcing 4:3 aspect ratio */}
      <div
        className="relative aspect-[4/3] w-full cursor-pointer overflow-hidden bg-slate-900"
        onClick={() => setIsLightboxOpen(true)}
      >
        <img
          src={validImages[currentIndex]}
          alt={`${articleTitle} image ${currentIndex + 1}`}
          className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
        />

        {/* Top Badges */}
        <div className="absolute top-2.5 right-2.5 flex items-center space-x-1.5">
          {validImages.length > 1 && (
            <span className="bg-slate-900/80 backdrop-blur-md text-slate-200 text-[11px] font-mono px-2 py-0.5 rounded-full border border-slate-700/60 shadow">
              {currentIndex + 1} / {validImages.length}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsLightboxOpen(true);
            }}
            className="p-1 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white transition backdrop-blur-md border border-slate-700/60"
            title="Expand photo"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Navigation Buttons for multiple images */}
        {validImages.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-900/80 text-white hover:bg-slate-800 transition opacity-80 group-hover:opacity-100 backdrop-blur border border-slate-700/60 shadow-lg cursor-pointer"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-900/80 text-white hover:bg-slate-800 transition opacity-80 group-hover:opacity-100 backdrop-blur border border-slate-700/60 shadow-lg cursor-pointer"
              aria-label="Next image"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Bottom Dots */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center space-x-1.5 bg-slate-900/60 backdrop-blur-md px-2 py-1 rounded-full border border-slate-800">
              {validImages.map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(idx);
                  }}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    idx === currentIndex ? 'bg-indigo-400 w-3' : 'bg-slate-500 hover:bg-slate-400'
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Lightbox Modal */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center">
            <button
              onClick={() => setIsLightboxOpen(false)}
              className="absolute top-2 right-2 p-2 rounded-full bg-slate-800 text-slate-300 hover:text-white transition z-10"
            >
              <X className="w-6 h-6" />
            </button>

            <img
              src={validImages[currentIndex]}
              alt={articleTitle}
              className="max-h-[80vh] max-w-full object-contain rounded-xl border border-slate-800 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />

            <p className="mt-3 text-xs text-slate-400 text-center font-medium max-w-xl">
              {articleTitle} {validImages.length > 1 ? `(${currentIndex + 1}/${validImages.length})` : ''}
            </p>

            {validImages.length > 1 && (
              <div className="flex items-center space-x-4 mt-3" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={handlePrev}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium flex items-center space-x-1 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>
                <button
                  onClick={handleNext}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium flex items-center space-x-1 transition"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
