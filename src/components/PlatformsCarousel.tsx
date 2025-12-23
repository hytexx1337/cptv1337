'use client';

import { logger } from '@/lib/logger';
import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { MediaItem } from '@/types/tmdb';
import { getImageUrl, getOriginalTitle } from '@/lib/tmdb';

interface PlatformsCarouselProps {
  showAllLink?: boolean; // Si mostrar link "Ver todo"
}

type Platform = {
  id: string;
  name: string;
  color: string; // Color de la tab activa
};

const platforms: Platform[] = [
  { id: 'netflix', name: 'Netflix', color: 'bg-red-600' },
  { id: 'prime', name: 'Prime', color: 'bg-blue-500' },
  { id: 'max', name: 'Max', color: 'bg-purple-600' },
  { id: 'disney-plus', name: 'Disney+', color: 'bg-blue-400' },
  { id: 'apple-tv', name: 'AppleTV', color: 'bg-gray-600' },
  { id: 'paramount', name: 'Paramount', color: 'bg-blue-600' },
];

const mediaTypeLabels: Record<string, string> = {
  tv: 'Series',
  movie: 'Películas',
};

export default function PlatformsCarousel({ showAllLink = false }: PlatformsCarouselProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>(platforms[0]);
  const [mediaType, setMediaType] = useState<'tv' | 'movie'>('tv');
  const [content, setContent] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Fetch content when platform or media type changes
  useEffect(() => {
    const fetchContent = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/platform/${selectedPlatform.id}?media_type=${mediaType}&page=1`
        );
        if (response.ok) {
          const data = await response.json();
          setContent(data.results.slice(0, 20)); // Top 20
        }
      } catch (error) {
        logger.error('Error fetching platform content:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [selectedPlatform, mediaType]);

  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const scrollAmount = carouselRef.current.offsetWidth * 0.8;
      carouselRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="mb-12">
      {/* Header con título y media type toggle */}
      <div className="flex items-center justify-between mb-6 px-4 md:px-6 lg:px-8">
        <h2 className="text-3xl font-medium text-white tracking-tight">
          {mediaTypeLabels[mediaType]} en {selectedPlatform.name}
        </h2>
        
        {/* Toggle Movies/Series */}
        <div className="flex gap-2 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setMediaType('tv')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mediaType === 'tv'
                ? 'bg-white text-black'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Series
          </button>
          <button
            onClick={() => setMediaType('movie')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mediaType === 'movie'
                ? 'bg-white text-black'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Películas
          </button>
        </div>
      </div>

      {/* Platform Tabs */}
      <div className="flex gap-6 mb-6 border-b border-gray-800 px-4 md:px-6 lg:px-8 overflow-x-auto scrollbar-hide">
        {platforms.map((platform) => (
          <button
            key={platform.id}
            onClick={() => setSelectedPlatform(platform)}
            className={`pb-2 text-base font-semibold transition-colors relative whitespace-nowrap ${
              selectedPlatform.id === platform.id
                ? 'text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {platform.name}
            {selectedPlatform.id === platform.id && (
              <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${platform.color}`} />
            )}
          </button>
        ))}
      </div>

      {/* Carrusel */}
      <div className="relative px-4 md:px-6 lg:px-8 group">
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="text-white text-lg">Cargando...</div>
          </div>
        )}

        {/* Content */}
        {!loading && content.length > 0 && (
          <>
            {/* Navigation arrows */}
            <button
              onClick={() => scrollCarousel('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/80 hover:bg-black text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 shadow-xl"
              aria-label="Anterior"
            >
              <ChevronLeftIcon className="w-6 h-6" />
            </button>

            <button
              onClick={() => scrollCarousel('right')}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/80 hover:bg-black text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 shadow-xl"
              aria-label="Siguiente"
            >
              <ChevronRightIcon className="w-6 h-6" />
            </button>

            {/* Scrollable content */}
            <div
              ref={carouselRef}
              className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {content.map((item) => (
                <Link
                  key={item.id}
                  href={`/${mediaType === 'movie' ? 'movie' : 'tv'}/${item.id}`}
                  className="flex-shrink-0 w-40 sm:w-48 md:w-52 group/item"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-gray-800">
                    {item.poster_path ? (
                      <Image
                        src={getImageUrl(item.poster_path, 'w342')}
                        alt={getOriginalTitle(item)}
                        fill
                        className="object-cover transition-transform duration-200 group-hover/item:scale-105"
                        sizes="(max-width: 640px) 160px, (max-width: 768px) 192px, 208px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                        Sin imagen
                      </div>
                    )}
                  </div>
                  <p className="text-white text-sm mt-2 line-clamp-2">
                    {getOriginalTitle(item)}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {!loading && content.length === 0 && (
          <div className="text-center text-gray-400 py-12">
            No se encontró contenido para esta plataforma
          </div>
        )}
      </div>

      {/* "Ver todo" link */}
      {showAllLink && content.length > 0 && (
        <div className="text-right mt-4 px-4 md:px-6 lg:px-8">
          <Link
            href={`/platform/${selectedPlatform.id}`}
            className="text-red-500 hover:text-red-400 font-semibold text-sm"
          >
            Ver todo →
          </Link>
        </div>
      )}
    </div>
  );
}

