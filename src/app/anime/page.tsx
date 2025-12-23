'use client';

import { logger } from '@/lib/logger';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import LoadingSpinner from '@/components/LoadingSpinner';
import MediaCarousel from '@/components/MediaCarousel';
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

async function fetchAnime(sortBy: string = 'popularity.desc', pages: number = 3, provider?: string) {
  try {
    const pagePromises = Array.from({ length: pages }, (_, i) => {
      const url = provider
        ? `/api/anime?sort_by=${sortBy}&page=${i + 1}&provider=${provider}`
        : `/api/anime?sort_by=${sortBy}&page=${i + 1}`;
      return fetch(url);
    });
    
    const responses = await Promise.all(pagePromises);
    const dataPromises = responses
      .filter(r => r.ok)
      .map(r => r.json());
    
    const allData = await Promise.all(dataPromises);
    const allResults = allData.flatMap(data => data.results || []);
    
    // Eliminar duplicados por ID
    const uniqueResults = Array.from(
      new Map(allResults.map((item: any) => [item.id, item])).values()
    );
    
    return uniqueResults as MediaItem[];
  } catch (error) {
    logger.error('Error fetching anime:', error);
    return [];
  }
}

export default function AnimePage() {
  const [featuredAnime, setFeaturedAnime] = useState<MediaItem | null>(null);
  const [featuredImages, setFeaturedImages] = useState<TMDBImages | null>(null);
  const [popularAnime, setPopularAnime] = useState<MediaItem[]>([]);
  const [topRatedAnime, setTopRatedAnime] = useState<MediaItem[]>([]);
  const [recentAnime, setRecentAnime] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      
      // Cargar 3 categorías en paralelo
      const [popular, topRated, recent] = await Promise.all([
        fetchAnime('popularity.desc', 3),
        fetchAnime('vote_average.desc', 3, 'crunchyroll'), // Mejor valorados de Crunchyroll
        fetchAnime('first_air_date.desc', 3, 'crunchyroll'), // Recientes de Crunchyroll
      ]);
      
      // Featured = el más popular
      if (popular.length > 0) {
        // Cargar imágenes (logo) del featured PRIMERO
        try {
          const imagesResponse = await fetch(`/api/tv/${popular[0].id}/images`);
          if (imagesResponse.ok) {
            const imagesData = await imagesResponse.json();
            setFeaturedImages(imagesData);
          }
        } catch (error) {
          logger.error('Error fetching featured images:', error);
        }
        
        // DESPUÉS setear el featured anime y popular
        setFeaturedAnime(popular[0]);
        setPopularAnime(popular.slice(1));
      }
      
      // Filtrar duplicados entre categorías
      const usedIds = new Set(popular.map(item => item.id));
      
      setTopRatedAnime(topRated.filter(item => {
        if (usedIds.has(item.id)) return false;
        usedIds.add(item.id);
        return true;
      }));
      
      setRecentAnime(recent.filter(item => {
        if (usedIds.has(item.id)) return false;
        usedIds.add(item.id);
        return true;
      }));
      
      setLoading(false);
    };
    
    loadContent();
  }, []);

  const logoFromImages = featuredImages?.logos?.find(logo => logo.iso_639_1 === 'en' || logo.iso_639_1 === null);

  return (
    <div className="min-h-screen bg-black">
      <Header />

      {/* Hero section estilo Netflix */}
      {featuredAnime ? (
        <DetailHeroSection
          backdropPath={featuredAnime.backdrop_path || featuredAnime.poster_path}
          title={featuredAnime.name || featuredAnime.title || ''}
          logo={logoFromImages}
        >
          {/* Año y rating */}
          <div className="flex items-center gap-4 mb-6 drop-shadow-lg">
            <p className="text-lg text-white">
              {getYear(getReleaseDate(featuredAnime))}
            </p>
            {featuredAnime.vote_average > 0 && (
              <div className="flex items-center gap-1.5">
                <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-white font-semibold">{featuredAnime.vote_average.toFixed(1)}</span>
              </div>
            )}
          </div>
          
          {/* Overview */}
          <p className="text-white text-lg leading-relaxed mb-8 line-clamp-3 drop-shadow-lg max-w-2xl">
            {featuredAnime.overview}
          </p>
          
          {/* Botón ver ahora */}
          <Link
            href={`/tv/${featuredAnime.id}`}
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

      {/* Carruseles de anime */}
      <div className="relative z-10">
        {loading ? (
          <div className="py-20">
            <LoadingSpinner />
          </div>
        ) : (
          <>
            {popularAnime.length > 0 && (
              <MediaCarousel 
                title="Tendencias"
                items={popularAnime}
              />
            )}
            
            {topRatedAnime.length > 0 && (
              <MediaCarousel 
                title="Mejor valorados"
                items={topRatedAnime}
              />
            )}
            
            {recentAnime.length > 0 && (
              <MediaCarousel 
                title="Recientes"
                items={recentAnime}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
