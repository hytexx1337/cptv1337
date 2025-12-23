'use client';

import { logger } from '@/lib/logger';
import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import LoadingSpinner from '@/components/LoadingSpinner';
import Header from '@/components/Header';
import { MediaItem, TMDBImages } from '@/types/tmdb';
import { getImageUrl, getOriginalTitle, getYear, getReleaseDate } from '@/lib/tmdb';
import DetailHeroSection from '@/components/DetailHeroSection';

// Helper para obtener el logo original (solo en inglés)
const getOriginalLogo = (images: TMDBImages | null): string | undefined => {
  if (!images?.logos || images.logos.length === 0) return undefined;
  
  // Solo aceptar logos en inglés
  const englishLogo = images.logos.find(logo => logo.iso_639_1 === 'en');
  
  return englishLogo?.file_path ? getImageUrl(englishLogo.file_path, 'w342') : undefined;
};

const genres = [
  { id: '28', name: 'Acción' },
  { id: '12', name: 'Aventura' },
  { id: '16', name: 'Animación' },
  { id: '35', name: 'Comedia' },
  { id: '80', name: 'Crimen' },
  { id: '99', name: 'Documental' },
  { id: '18', name: 'Drama' },
  { id: '10751', name: 'Familia' },
  { id: '14', name: 'Fantasía' },
  { id: '27', name: 'Terror' },
  { id: '10749', name: 'Romance' },
  { id: '878', name: 'Ciencia Ficción' },
  { id: '53', name: 'Suspenso' },
];

export default function MoviesPage() {
  const [selectedGenre, setSelectedGenre] = useState(genres[0].id);
  const [content, setContent] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalResults, setTotalResults] = useState(0);
  const [featuredImages, setFeaturedImages] = useState<TMDBImages | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const selectedGenreName = genres.find(g => g.id === selectedGenre)?.name || 'Películas';

  useEffect(() => {
    fetchContentAndImages(1, true);
  }, [selectedGenre]);

  const fetchContentAndImages = async (pageNum: number, reset: boolean = false) => {
    setLoading(true);
    console.log('[MOVIES DEBUG] Fetching genre:', selectedGenre, 'page:', pageNum);
    try {
      const response = await fetch(
        `/api/genre/${selectedGenre}?media_type=movie&page=${pageNum}`
      );
      
      console.log('[MOVIES DEBUG] Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[MOVIES DEBUG] Data received:', data.results?.length, 'items');
        
        if (reset) {
          // NO setear el contenido aún - esperar a que las imágenes carguen
          
          // Cargar imágenes del primer item
          if (data.results.length > 0) {
            const featuredItem = data.results[0];
            console.log('[MOVIES DEBUG] Fetching images for:', featuredItem.id);
            
            const imagesResponse = await fetch(`/api/movie/${featuredItem.id}/images`);
            console.log('[MOVIES DEBUG] Images response:', imagesResponse.status);
            
            if (imagesResponse.ok) {
              const imagesData = await imagesResponse.json();
              console.log('[MOVIES DEBUG] Images data:', imagesData);
              setFeaturedImages(imagesData);
            }
          }
          
          // AHORA sí setear el contenido - después de que las imágenes cargaron
          setContent(data.results);
        } else {
          setContent(prev => [...prev, ...data.results]);
        }
        
        setTotalResults(data.total_results || 0);
        setHasMore(data.page < data.total_pages);
        setPage(pageNum);
      }
    } catch (error) {
      console.error('[MOVIES DEBUG] Error fetching:', error);
      logger.error('Error fetching movies:', error);
    } finally {
      console.log('[MOVIES DEBUG] Loading finished');
      setLoading(false);
    }
  };

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchContentAndImages(page + 1, false);
    }
  }, [loading, hasMore, page]);

  // Infinite scroll con Intersection Observer
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && hasMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loadMore, loading, hasMore]);

  const featuredItem = content.length > 0 ? content[0] : null;

  const logoFromImages = featuredImages?.logos?.find(logo => logo.iso_639_1 === 'en' || logo.iso_639_1 === null);

  return (
    <div className="min-h-screen bg-black">
      <Header />

      {/* Hero section estilo Netflix */}
      {featuredItem ? (
        <DetailHeroSection
          backdropPath={featuredItem.backdrop_path || featuredItem.poster_path}
          title={getOriginalTitle(featuredItem)}
          logo={logoFromImages}
        >
          {/* Año y rating */}
          <div className="flex items-center gap-4 mb-6 drop-shadow-lg">
            <p className="text-lg text-white">
              {getYear(getReleaseDate(featuredItem))}
            </p>
            {featuredItem.vote_average > 0 && (
              <div className="flex items-center gap-1.5">
                <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-white font-semibold">{featuredItem.vote_average.toFixed(1)}</span>
              </div>
            )}
          </div>
          
          {/* Overview */}
          <p className="text-white text-lg leading-relaxed mb-8 line-clamp-3 drop-shadow-lg max-w-2xl">
            {featuredItem.overview}
          </p>
          
          {/* Botón ver ahora */}
          <Link
            href={`/movie/${featuredItem.id}`}
            className="inline-flex items-center gap-2 bg-white hover:bg-white/90 text-black px-8 py-4 rounded-lg font-bold transition-all duration-200 shadow-lg hover:shadow-xl drop-shadow-xl"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            Ver ahora
          </Link>
        </DetailHeroSection>
      ) : (
        <div className="h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
          <LoadingSpinner />
        </div>
      )}

      {/* Contenido principal */}
      <div className="container mx-auto px-4 py-12">
        {/* Selector de géneros */}
        <div className="mb-12">
          <h3 className="text-white text-lg font-semibold mb-4 text-center">Explorar por género</h3>
          <div className="flex flex-wrap justify-center gap-3">
            {genres.map((genre) => (
              <button
                key={genre.id}
                onClick={() => setSelectedGenre(genre.id)}
                className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                  selectedGenre === genre.id
                    ? 'bg-white text-black shadow-lg'
                    : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white backdrop-blur-sm'
                }`}
              >
                {genre.name}
              </button>
            ))}
          </div>
        </div>

        {/* Contador de resultados */}
        {totalResults > 0 && (
          <p className="text-white/50 text-sm text-center mb-8">
            {totalResults.toLocaleString()} películas de {selectedGenreName}
          </p>
        )}

        {/* Grid de contenido */}
        {loading && content.length === 0 ? (
          <div className="py-20">
            <LoadingSpinner />
          </div>
        ) : content.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/50 text-lg">No hay contenido disponible</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {/* Saltar el primer item porque ya está en el hero */}
              {content.slice(1).map((item) => (
                <Link
                  key={item.id}
                  href={`/movie/${item.id}`}
                  className="group"
                >
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-gray-900 shadow-lg transition-all duration-300 group-hover:shadow-2xl group-hover:scale-105 group-hover:z-10">
                    {item.poster_path ? (
                      <Image
                        src={getImageUrl(item.poster_path, 'w342')}
                        alt={getOriginalTitle(item)}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600">
                        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                    
                    {/* Overlay hover */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    
                    {/* Rating badge */}
                    {item.vote_average > 0 && (
                      <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-sm px-2 py-1 rounded-md flex items-center gap-1">
                        <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="text-white text-xs font-bold">{item.vote_average.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Título y año */}
                  <div className="mt-3">
                    <p className="text-white text-sm font-medium line-clamp-2 group-hover:text-white transition-colors">
                      {getOriginalTitle(item)}
                    </p>
                    <p className="text-gray-500 text-xs mt-1 font-medium">
                      {getYear(getReleaseDate(item))}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Infinite scroll trigger */}
            {hasMore && (
              <div ref={loadMoreRef} className="text-center mt-16 mb-8 py-8">
                {loading && (
                  <div className="flex flex-col items-center gap-3">
                    <LoadingSpinner />
                    <p className="text-white/50 text-sm">Cargando más contenido...</p>
                  </div>
                )}
              </div>
            )}

            {/* Mensaje final */}
            {!hasMore && content.length > 0 && (
              <div className="text-center mt-16 mb-12">
                <p className="text-white/40 text-sm font-medium">
                  Has visto todo el contenido disponible 🎬
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
