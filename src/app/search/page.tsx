'use client';

import { logger } from '@/lib/logger';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import { MediaItem } from '@/types/tmdb';
import Link from 'next/link';
import Image from 'next/image';
import { getImageUrl, getYear } from '@/lib/tmdb';

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSearchResults = async () => {
      if (!query) return;

      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
          throw new Error('Error en la búsqueda');
        }
        
        const data = await response.json();
        // Filtrar solo películas y series (excluir contenido adulto)
        const filteredResults = data.results.filter((item: MediaItem) => 
          (item.media_type === 'movie' || item.media_type === 'tv') && !item.adult
        );
        setResults(filteredResults);
      } catch (err) {
        setError('Error al realizar la búsqueda');
        logger.error('Error searching:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSearchResults();
  }, [query]);

  if (!query) {
    return (
      <div className="min-h-screen bg-black pt-32 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <p className="text-gray-400">Ingresa un término de búsqueda para encontrar películas y series.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black pt-32 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black pt-32 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <p className="text-red-500 text-lg">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pt-32 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {results.length > 0 ? (
          <div>
            <p className="text-gray-400 mb-8 text-lg">
              {results.length} resultado{results.length !== 1 ? 's' : ''}
            </p>
            
            {/* Grid estilo Netflix - Cards más grandes */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
              {results.map((item) => {
                const href = item.media_type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
                const title = item.media_type === 'movie' ? item.title : item.name;
                const year = getYear(item.media_type === 'movie' ? item.release_date : item.first_air_date);
                const posterUrl = getImageUrl(item.poster_path, 'w500');

                return (
                  <Link 
                    key={`${item.id}-${item.media_type}`} 
                    href={href}
                    className="group relative block"
                  >
                    <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-gray-900 shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:shadow-2xl group-hover:ring-2 group-hover:ring-red-500/50">
                      {/* Poster */}
                      <Image
                        src={posterUrl}
                        alt={title || 'Poster'}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
                        className="object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '/placeholder-poster.jpg';
                        }}
                      />
                      
                      {/* Gradiente overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      {/* Info al hacer hover */}
                      <div className="absolute bottom-0 left-0 right-0 p-4 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                        <h3 className="text-white font-bold text-sm md:text-base line-clamp-2 mb-1">
                          {title}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-gray-300">
                          <span>{year}</span>
                          <span>•</span>
                          <span className="capitalize">
                            {item.media_type === 'movie' ? 'Película' : 'Serie'}
                          </span>
                        </div>
                        {item.vote_average > 0 && (
                          <div className="flex items-center gap-1 mt-2">
                            <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            <span className="text-white text-sm font-semibold">
                              {item.vote_average.toFixed(1)}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Badge de tipo */}
                      <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-semibold text-white border border-white/20">
                        {item.media_type === 'movie' ? 'PELÍCULA' : 'SERIE'}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-300 text-lg">
              No se encontraron resultados para "{query}".
            </p>
            <p className="text-gray-400 mt-2">
              Intenta con otros términos de búsqueda.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SearchContent />
    </Suspense>
  );
}