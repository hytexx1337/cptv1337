'use client';

import { logger } from '@/lib/logger';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeftIcon } from '@heroicons/react/24/solid';
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

const platformNames: Record<string, string> = {
  netflix: 'Netflix',
  prime: 'Amazon Prime Video',
  max: 'Max (HBO)',
  'disney-plus': 'Disney+',
  'apple-tv': 'Apple TV+',
  paramount: 'Paramount+',
};

const platformLogos: Record<string, string> = {
  netflix: '/netflix.svg',
  prime: '/Amazon_Prime_logo_(2024).svg',
  max: '/HBO_Max_(2025).svg',
  'disney-plus': '/Disney+_2024.svg',
  'apple-tv': '/Apple_TV_(logo).svg',
  paramount: '/Paramount_Plus.svg',
};

const platformColors: Record<string, string> = {
  netflix: 'from-red-600 to-red-800',
  prime: 'from-blue-500 to-blue-700',
  max: 'from-purple-600 to-purple-800',
  'disney-plus': 'from-blue-400 to-blue-600',
  'apple-tv': 'from-gray-600 to-gray-800',
  paramount: 'from-blue-600 to-blue-800',
};

export default function PlatformPage() {
  const params = useParams();
  const router = useRouter();
  const provider = params.provider as string;
  
  const [mediaType, setMediaType] = useState<'tv' | 'movie'>('tv');
  const [content, setContent] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalResults, setTotalResults] = useState(0);
  const [featuredImages, setFeaturedImages] = useState<TMDBImages | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const platformName = platformNames[provider] || provider;
  const platformLogo = platformLogos[provider];
  const platformGradient = platformColors[provider] || 'from-gray-600 to-gray-800';

  useEffect(() => {
    fetchContentAndImages(1, true);
  }, [provider, mediaType]);

  const fetchContentAndImages = async (pageNum: number, reset: boolean = false) => {
    setLoading(true);
    try {
      // Cargar contenido
      const response = await fetch(
        `/api/platform/${provider}?media_type=${mediaType}&page=${pageNum}`
      );
      
      if (response.ok) {
        const data = await response.json();
        
        if (reset) {
          // NO setear el contenido aún - esperar a que las imágenes carguen
          
          // Cargar imágenes del primer item en paralelo
          if (data.results.length > 0) {
            const featuredItem = data.results[0];
            
            // Precargar backdrop e imágenes en paralelo
            const [imagesResponse] = await Promise.all([
              fetch(`/api/${mediaType}/${featuredItem.id}/images`),
              // Precargar backdrop con fetchPriority
              new Promise<void>((resolve) => {
                if (featuredItem.backdrop_path) {
                  const img = new window.Image();
                  img.fetchPriority = 'high';
                  img.src = `https://image.tmdb.org/t/p/original${featuredItem.backdrop_path}`;
                  img.onload = () => resolve();
                  img.onerror = () => resolve();
                } else {
                  resolve();
                }
              })
            ]);
            
            if (imagesResponse.ok) {
              const imagesData = await imagesResponse.json();
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
      logger.error('Error fetching platform content:', error);
    } finally {
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

  if (!platformNames[provider]) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Plataforma no encontrada</h1>
          <Link href="/" className="text-red-500 hover:text-red-400">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  // Item destacado para el hero (primer item de la lista)
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
            href={mediaType === 'movie' ? `/movie/${featuredItem.id}` : `/tv/${featuredItem.id}`}
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
        {/* Toggle Movies/Series - Centrado y sin íconos */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex bg-white/10 backdrop-blur-sm rounded-full p-1.5">
            <button
              onClick={() => setMediaType('tv')}
              className={`px-8 py-3 rounded-full text-sm font-semibold transition-all duration-200 ${
                mediaType === 'tv'
                  ? 'bg-white text-black shadow-lg'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Series
            </button>
            <button
              onClick={() => setMediaType('movie')}
              className={`px-8 py-3 rounded-full text-sm font-semibold transition-all duration-200 ${
                mediaType === 'movie'
                  ? 'bg-white text-black shadow-lg'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Películas
            </button>
          </div>
        </div>

        {/* Contador de resultados */}
        {totalResults > 0 && (
          <p className="text-white/50 text-sm text-center mb-8">
            {totalResults.toLocaleString()} {mediaType === 'tv' ? 'series' : 'películas'} disponibles
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
                  href={`/${mediaType === 'movie' ? 'movie' : 'tv'}/${item.id}`}
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

