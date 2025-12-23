'use client';

import { MediaItem } from '@/types/tmdb';
import Link from 'next/link';
import Image from 'next/image';
import { getImageUrl, getOriginalTitle } from '@/lib/tmdb';
import { useRef } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';

interface TopTenSectionProps {
  items: MediaItem[];
  mediaType: 'movie' | 'tv';
}

export default function TopTenSection({ items, mediaType }: TopTenSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filtrar contenido adulto por si acaso
  const filteredItems = items?.filter(item => !item.adult) || [];

  if (!filteredItems || filteredItems.length === 0) {
    return null;
  }

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Tomar solo los primeros 10
  const topTen = filteredItems.slice(0, 10);

  return (
    <div className="mb-16 group">
      {/* Header con imagen TOP 10 */}
      <div className="px-4 md:px-6 lg:px-8 mb-6 flex items-center justify-center md:justify-start">
        <Image 
          src={mediaType === 'tv' ? '/top10tv.png' : '/top10mv.png'}
          alt={mediaType === 'tv' ? 'Top 10 Series' : 'Top 10 Películas'}
          width={500}
          height={200}
          className="h-auto w-auto max-h-32 md:max-h-40 lg:max-h-48"
          priority
        />
      </div>

      <div className="relative px-4 md:px-6 lg:px-8">
        {/* Botón izquierdo */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-black/80 hover:bg-black text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 shadow-xl"
          aria-label="Anterior"
        >
          <ChevronLeftIcon className="w-6 h-6" />
        </button>

        {/* Carrusel */}
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {topTen.map((item, index) => {
            const title = getOriginalTitle(item);
            const posterUrl = getImageUrl(item.poster_path, 'w342');
            const detailUrl = mediaType === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;

            return (
              <Link 
                key={item.id} 
                href={detailUrl}
                className="relative flex-shrink-0 group/item"
              >
                {/* Contenedor con número y poster */}
                <div className="flex items-end">
                  {/* Número grande detrás */}
                  <div className="relative z-0 mr-[-30px] mb-4">
                    <span 
                      className="text-[180px] md:text-[220px] font-black leading-none text-transparent"
                      style={{
                        WebkitTextStroke: '2px rgba(255, 255, 255, 0.3)',
                        textShadow: '0 0 20px rgba(0, 0, 0, 0.8)'
                      }}
                    >
                      {index + 1}
                    </span>
                  </div>

                  {/* Poster */}
                  <div className="relative z-10 w-32 md:w-40 transition-all duration-300 group-hover/item:scale-105 group-hover/item:z-20">
                    <div className="aspect-[2/3] relative rounded-lg overflow-hidden shadow-2xl">
                      <Image
                        src={posterUrl}
                        alt={title}
                        fill
                        className="object-cover"
                        sizes="160px"
                      />
                      
                      {/* Overlay en hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity duration-300 flex items-end">
                        <div className="p-3 w-full">
                          <p className="text-white font-bold text-xs line-clamp-2">
                            {title}
                          </p>
                        </div>
                      </div>

                      {/* Efecto brillo en hover */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity duration-300" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Botón derecho */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-black/80 hover:bg-black text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 shadow-xl"
          aria-label="Siguiente"
        >
          <ChevronRightIcon className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

