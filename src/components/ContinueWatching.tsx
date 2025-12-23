'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { PlayIcon, XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { watchHistory, WatchHistoryItem } from '@/lib/watch-history';
import { getImageUrl } from '@/lib/tmdb';

export default function ContinueWatching() {
  const [items, setItems] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Cargar historial
    const loadHistory = () => {
      const history = watchHistory.getContinueWatching();
      setItems(history);
      setLoading(false);
    };

    loadHistory();

    // Actualizar cada 30 segundos por si el usuario vio algo en otra pestaña
    const interval = setInterval(loadHistory, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRemove = (item: WatchHistoryItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    watchHistory.removeItem(item.mediaType, item.id, item.season, item.episode);
    setItems(items.filter(i => 
      !(i.id === item.id && 
        i.mediaType === item.mediaType && 
        i.season === item.season && 
        i.episode === item.episode)
    ));
  };

  const getWatchUrl = (item: WatchHistoryItem) => {
    if (item.mediaType === 'movie') {
      // Navegar directo al reproductor
      return `/watch?type=movie&id=${item.id}`;
    } else {
      // Navegar directo al reproductor con temporada/episodio
      const season = item.season ?? 1;
      const episode = item.episode ?? 1;
      return `/watch?type=tv&id=${item.id}&season=${season}&episode=${episode}`;
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  if (loading) {
    return null;
  }

  if (items.length === 0) {
    return null; // No mostrar nada si no hay contenido
  }

  return (
    <div className="mb-12 overflow-visible">
      <h2 className="text-2xl md:text-3xl font-medium text-white mb-0 tracking-tight px-8 md:px-10 lg:px-12">
        Continuar viendo
      </h2>

      <div className="relative px-4 md:px-6 lg:px-8 py-4 pb-12">
        {/* Botón izquierdo */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/80 hover:bg-black text-white p-3 rounded-full transition-all duration-300 hover:scale-110 shadow-xl"
          aria-label="Anterior"
        >
          <ChevronLeftIcon className="w-6 h-6" />
        </button>

        {/* Carrusel horizontal con scroll */}
        <div 
          ref={scrollRef}
          className="flex gap-3 md:gap-4 overflow-x-auto overflow-y-visible scrollbar-hide scroll-smooth py-4 px-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map((item) => (
            <Link
              key={`${item.mediaType}-${item.id}-${item.season || ''}-${item.episode || ''}`}
              href={getWatchUrl(item)}
              className="group relative flex-shrink-0 w-96 sm:w-[28rem] md:w-[32rem]"
            >
              {/* Thumbnail con overlay de progreso */}
              <div className="relative aspect-video rounded overflow-hidden bg-gray-800">
                {/* Para series, usar stillPath (miniatura del episodio) si está disponible */}
                {(item.mediaType === 'tv' && item.stillPath) || item.backdropPath ? (
                  <Image
                    src={getImageUrl(
                      item.mediaType === 'tv' && item.stillPath ? item.stillPath : item.backdropPath!,
                      'w780'
                    )}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 384px, (max-width: 768px) 448px, 512px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    Sin imagen
                  </div>
                )}

                {/* Overlay oscuro en hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-300" />

                {/* Botón de play en hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
                    <PlayIcon className="w-6 h-6 text-black ml-1" />
                  </div>
                </div>

                {/* Botón de eliminar */}
                <button
                  onClick={(e) => handleRemove(item, e)}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/70 hover:bg-black/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"
                  title="Eliminar del historial"
                >
                  <XMarkIcon className="w-4 h-4 text-white" />
                </button>

                {/* Etiqueta de temporada/episodio */}
                {item.mediaType === 'tv' && (
                  <div className="absolute top-2 left-2 bg-black/80 px-2 py-1 rounded text-xs font-semibold text-white">
                    S{item.season} E{item.episode}
                  </div>
                )}

                {/* Tiempo transcurrido */}
                <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-medium text-white">
                  {watchHistory.formatTime(item.currentTime)}
                </div>

                {/* Barra de progreso */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                  <div
                    className="h-full bg-red-600 transition-all"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>

              {/* Título */}
              <div className="mt-2">
                <h3 className="text-sm font-medium text-white line-clamp-1">
                  {item.title}
                </h3>
                {item.mediaType === 'tv' && item.episodeTitle && (
                  <p className="text-xs text-gray-400 line-clamp-1">
                    {item.episodeTitle}
                  </p>
                )}
              </div>
            </Link>
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

      {/* Estilos para ocultar scrollbar pero mantener funcionalidad */}
      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;  /* IE y Edge */
          scrollbar-width: none;  /* Firefox */
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;  /* Chrome, Safari y Opera */
        }
      `}</style>
    </div>
  );
}

