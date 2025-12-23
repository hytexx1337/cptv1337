'use client';

import { MediaItem } from '@/types/tmdb';
import MediaCard from './MediaCard';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { useRef } from 'react';

interface MediaCarouselProps {
  items: MediaItem[];
  title?: string;
}

export default function MediaCarousel({ items, title }: MediaCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filtrar contenido adulto por si acaso
  const filteredItems = items?.filter(item => !item.adult) || [];

  if (!filteredItems || filteredItems.length === 0) {
    return null;
  }

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="mb-12 overflow-visible">
      {title && (
        <h2 className="text-3xl font-medium text-white mb-0 tracking-tight px-8 md:px-10 lg:px-12">{title}</h2>
      )}
      
      <div className="relative px-4 md:px-6 lg:px-8 py-4 pb-12">
        {/* Botón izquierdo */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/80 hover:bg-black text-white p-3 rounded-full transition-all duration-300 hover:scale-110 shadow-xl"
          aria-label="Anterior"
        >
          <ChevronLeftIcon className="w-6 h-6" />
        </button>

        {/* Carrusel */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto overflow-y-visible scrollbar-hide scroll-smooth py-4 px-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {filteredItems.map((item) => (
            <div key={`${item.id}-${item.media_type || 'unknown'}`} className="flex-shrink-0 w-96 sm:w-[28rem] md:w-[32rem]">
              <MediaCard item={item} />
            </div>
          ))}
        </div>

        {/* Botón derecho */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/80 hover:bg-black text-white p-3 rounded-full transition-all duration-300 hover:scale-110 shadow-xl"
          aria-label="Siguiente"
        >
          <ChevronRightIcon className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

