'use client';

import { useEffect, useState, useRef } from 'react';
import { watchHistory } from '@/lib/watch-history';
import { MediaItem } from '@/types/tmdb';
import MediaCard from './MediaCard';
import Image from 'next/image';
import Link from 'next/link';
import { getImageUrl } from '@/lib/tmdb';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';

export default function BecauseYouWatched() {
  const [baseItem, setBaseItem] = useState<{ title: string; posterPath: string | null; backdropPath: string | null; id: string; type: 'movie' | 'tv' } | null>(null);
  const [baseItemLogo, setBaseItemLogo] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadRecommendations = async () => {
      setLoading(true);
      
      // Obtener el último item visto del historial
      const history = watchHistory.getHistory();
      
      if (history.length === 0) {
        setLoading(false);
        return;
      }

      // Tomar el item más reciente
      const lastWatched = history[0];
      
      try {
        // Cargar detalles e imágenes del item en paralelo
        const [detailsResponse, imagesResponse] = await Promise.all([
          fetch(`/api/${lastWatched.mediaType}/${lastWatched.id}`),
          fetch(`/api/${lastWatched.mediaType}/${lastWatched.id}/images`)
        ]);
        
        if (!detailsResponse.ok) {
          setLoading(false);
          return;
        }
        
        const details = await detailsResponse.json();
        
        // Obtener logo si está disponible (solo en inglés)
        if (imagesResponse.ok) {
          const images = await imagesResponse.json();
          const logo = images.logos?.find((logo: any) => logo.iso_639_1 === 'en');
          if (logo) {
            setBaseItemLogo(logo.file_path);
          }
        }
        
        // Usar el poster y backdrop de los detalles si el del historial es null
        const posterPath = lastWatched.posterPath || details.poster_path || null;
        const backdropPath = lastWatched.backdropPath || details.backdrop_path || null;
        
        setBaseItem({
          title: lastWatched.mediaType === 'movie' ? details.title : details.name,
          posterPath: posterPath,
          backdropPath: backdropPath,
          id: String(lastWatched.id),
          type: lastWatched.mediaType
        });

        // Cargar recomendaciones basadas en ese item
        const recommendationsResponse = await fetch(
          `/api/${lastWatched.mediaType}/${lastWatched.id}/recommendations`
        );
        
        if (recommendationsResponse.ok) {
          const data = await recommendationsResponse.json();
          // Filtrar contenido adulto y limitar a 12 items
          const filtered = data.results
            .filter((item: MediaItem) => !item.adult)
            .slice(0, 12);
          setRecommendations(filtered);
        }
      } catch (error) {
        console.error('Error loading recommendations:', error);
      } finally {
        setLoading(false);
      }
    };

    loadRecommendations();
  }, []);

  if (loading || !baseItem || !baseItem.backdropPath || recommendations.length === 0) {
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

  const detailUrl = baseItem.type === 'movie' ? `/movie/${baseItem.id}` : `/tv/${baseItem.id}`;

  return (
    <div className="mb-12 overflow-visible">
      {/* Grid layout con backdrop fijo y carrusel que scrollea */}
      <div className="grid grid-cols-[auto_1fr] gap-4 px-4 md:px-6 lg:px-8">
        {/* Backdrop clickeable con línea roja y título integrado */}
        <Link
          href={detailUrl}
          className="relative w-[28rem] sm:w-[32rem] md:w-[36rem] aspect-video overflow-hidden group cursor-pointer"
        >
          {/* Línea vertical roja a la izquierda */}
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-600 z-20" />
          
          <Image
            src={getImageUrl(baseItem.backdropPath, 'w780')}
            alt={baseItem.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 448px, (max-width: 768px) 512px, 576px"
          />
          
          {/* Gradientes para legibilidad */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/20 to-black" />
          
          {/* Título "Porque viste" en la parte superior */}
          <div className="absolute top-0 left-0 right-0 p-6">
            <h2 className="text-2xl md:text-3xl font-medium text-white tracking-tight drop-shadow-2xl">
              Porque viste
            </h2>
          </div>
          
          {/* Logo o título en la parte inferior */}
          <div className="absolute bottom-0 left-0 right-0 p-6">
            {baseItemLogo ? (
              <img
                src={getImageUrl(baseItemLogo, 'w500')}
                alt={baseItem.title}
                className="max-w-[280px] max-h-[100px] w-auto h-auto object-contain"
                style={{
                  filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.9)) drop-shadow(0 0 16px rgba(0,0,0,0.5))'
                }}
              />
            ) : (
              <h3 className="text-white font-semibold text-2xl line-clamp-2 drop-shadow-2xl">
                {baseItem.title}
              </h3>
            )}
          </div>
        </Link>

        {/* Carrusel de recomendaciones con estructura de MediaCarousel */}
        <div className="relative py-4 pb-12 overflow-hidden z-0">
          {/* Botón izquierdo */}
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-50 bg-black/80 hover:bg-black text-white p-3 rounded-full transition-all duration-300 hover:scale-110 shadow-xl"
            aria-label="Anterior"
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </button>

          {/* Carrusel scrollable */}
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto overflow-y-visible scrollbar-hide scroll-smooth py-4 px-4 relative z-0"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {recommendations.map((item) => (
              <div key={`${item.media_type}-${item.id}`} className="flex-shrink-0 w-96 sm:w-[28rem] md:w-[32rem] relative z-0">
                <MediaCard item={item} />
              </div>
            ))}
          </div>

          {/* Botón derecho */}
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-50 bg-black/80 hover:bg-black text-white p-3 rounded-full transition-all duration-300 hover:scale-110 shadow-xl"
            aria-label="Siguiente"
          >
            <ChevronRightIcon className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

