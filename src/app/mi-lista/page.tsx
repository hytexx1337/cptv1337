'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Header from '@/components/Header';
import { WatchlistItem, getWatchlist } from '@/lib/watchlist';
import { getImageUrl, getYear, getReleaseDate } from '@/lib/tmdb';
import LoadingSpinner from '@/components/LoadingSpinner';
import MediaCard from '@/components/MediaCard';
import { MediaItem, TMDBImages, MovieDetails, TVShowDetails } from '@/types/tmdb';
import DetailHeroSection from '@/components/DetailHeroSection';
import { logger } from '@/lib/logger';
import { StarIcon, CalendarIcon, ClockIcon } from '@heroicons/react/24/solid';

// Helper para obtener el logo original (solo en inglés)
const getOriginalLogo = (images: TMDBImages | null): string | undefined => {
  if (!images?.logos || images.logos.length === 0) return undefined;
  
  // Solo aceptar logos en inglés
  const englishLogo = images.logos.find(logo => logo.iso_639_1 === 'en');
  
  return englishLogo?.file_path ? getImageUrl(englishLogo.file_path, 'w342') : undefined;
};

export default function MiListaPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [featuredImages, setFeaturedImages] = useState<TMDBImages | null>(null);
  const [featuredDetails, setFeaturedDetails] = useState<MovieDetails | TVShowDetails | null>(null);

  useEffect(() => {
    const loadWatchlist = async () => {
      setLoading(true);
      const list = getWatchlist();
      
      // Si hay items, cargar imágenes y detalles completos del primero
      if (list.length > 0) {
        try {
          const firstItem = list[0];
          const [imagesResponse, detailsResponse] = await Promise.all([
            fetch(`/api/${firstItem.type}/${firstItem.id}/images`),
            fetch(`/api/${firstItem.type}/${firstItem.id}`)
          ]);
          
          if (imagesResponse.ok) {
            const imagesData = await imagesResponse.json();
            setFeaturedImages(imagesData);
          }
          
          if (detailsResponse.ok) {
            const detailsData = await detailsResponse.json();
            setFeaturedDetails(detailsData);
          }
        } catch (error) {
          logger.error('Error fetching featured data:', error);
        }
      }
      
      setWatchlist(list);
      setLoading(false);
    };
    
    loadWatchlist();

    // Escuchar cambios en la lista
    const handleWatchlistUpdate = () => {
      loadWatchlist();
    };

    window.addEventListener('watchlistUpdated', handleWatchlistUpdate);
    return () => window.removeEventListener('watchlistUpdated', handleWatchlistUpdate);
  }, []);

  // Convertir WatchlistItem a MediaItem para compatibilidad con MediaCard
  const convertToMediaItem = (item: WatchlistItem): MediaItem => ({
    id: item.id,
    title: item.type === 'movie' ? item.title : undefined,
    name: item.type === 'tv' ? item.title : undefined,
    poster_path: item.poster_path,
    backdrop_path: item.backdrop_path,
    vote_average: item.vote_average,
    release_date: item.release_date,
    first_air_date: item.first_air_date,
    media_type: item.type,
    overview: '',
    genre_ids: [],
    popularity: 0,
    vote_count: 0,
    original_language: 'en',
    adult: false
  });

  const logoFromImages = featuredImages?.logos?.find(logo => logo.iso_639_1 === 'en' || logo.iso_639_1 === null);
  const featuredItem = watchlist.length > 0 ? watchlist[0] : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <Header />

      {/* Hero section con el primer item o estado vacío */}
      {featuredItem ? (
        <DetailHeroSection
          backdropPath={featuredItem.backdrop_path || featuredItem.poster_path}
          title={featuredItem.title}
          logo={logoFromImages}
        >
          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-4 mb-6 text-white drop-shadow-lg">
            {/* Año */}
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-gray-300" />
              <span className="text-lg">
                {getYear(featuredItem.release_date || featuredItem.first_air_date || '')}
              </span>
            </div>

            {/* Rating */}
            {featuredItem.vote_average > 0 && (
              <div className="flex items-center gap-2">
                <StarIcon className="w-5 h-5 text-yellow-400" />
                <span className="text-lg font-semibold">{featuredItem.vote_average.toFixed(1)}</span>
              </div>
            )}

            {/* Duración (solo para películas) */}
            {featuredItem.type === 'movie' && featuredDetails && 'runtime' in featuredDetails && featuredDetails.runtime && (
              <div className="flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-gray-300" />
                <span className="text-lg">
                  {Math.floor(featuredDetails.runtime / 60)}h {featuredDetails.runtime % 60}m
                </span>
              </div>
            )}
          </div>

          {/* Overview/Sinopsis */}
          {featuredDetails && (
            <div className="mb-8">
              <p className="text-white text-lg leading-relaxed max-w-2xl drop-shadow-lg">
                {'overview' in featuredDetails ? featuredDetails.overview : ''} 
                {!('overview' in featuredDetails && featuredDetails.overview) && 'Sin sinopsis disponible.'}
              </p>
            </div>
          )}

          {/* Géneros */}
          {featuredDetails && 'genres' in featuredDetails && featuredDetails.genres && featuredDetails.genres.length > 0 && (
            <div className="flex flex-wrap gap-2 text-white/70 drop-shadow-lg mb-8">
              {featuredDetails.genres.map((genre, index) => (
                <span key={genre.id}>
                  {genre.name}
                  {index < featuredDetails.genres.length - 1 && <span className="ml-2">•</span>}
                </span>
              ))}
            </div>
          )}

          {/* Botón ver ahora */}
          <div className="flex flex-wrap gap-4">
            <Link
              href={featuredItem.type === 'movie' 
                ? `/watch?type=movie&id=${featuredItem.id}` 
                : `/tv/${featuredItem.id}`
              }
              className="inline-flex items-center gap-2 bg-white hover:bg-white/90 text-black px-8 py-4 rounded-lg font-bold transition-all duration-200 shadow-lg hover:shadow-xl drop-shadow-xl text-lg"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
              {featuredItem.type === 'movie' ? 'Reproducir' : 'Ver ahora'}
            </Link>
          </div>
        </DetailHeroSection>
      ) : (
        <div className="h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center pt-24">
          <div className="text-center">
            <svg className="w-24 h-24 mx-auto text-gray-700 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <h2 className="text-4xl font-bold text-white mb-4">Tu lista está vacía</h2>
            <p className="text-xl text-gray-400 mb-8">
              Agrega películas y series para verlas más tarde
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-white hover:bg-white/90 text-black px-8 py-4 rounded-lg font-bold transition-colors shadow-lg"
            >
              Explorar contenido
            </Link>
          </div>
        </div>
      )}

      {/* Contenido - Grid con el resto de items */}
      {watchlist.length > 1 && (
        <div className="container mx-auto px-4 py-12">
          <h2 className="text-2xl font-bold text-white mb-6">
            Todos los títulos ({watchlist.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {watchlist.slice(1).map((item) => (
              <MediaCard key={`${item.type}-${item.id}`} item={convertToMediaItem(item)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
