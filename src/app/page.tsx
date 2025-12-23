import { logger } from '@/lib/logger';
import { Suspense } from 'react';
import MediaGrid from '@/components/MediaGrid';
import MediaCarousel from '@/components/MediaCarousel';
import LuckyPick from '@/components/LuckyPick';
import PlatformsCarousel from '@/components/PlatformsCarousel';
import LoadingSpinner from '@/components/LoadingSpinner';
import HeroSection from '@/components/HeroSection';
import ContinueWatching from '@/components/ContinueWatching';
import BecauseYouWatched from '@/components/BecauseYouWatched';
import { MediaItem } from '@/types/tmdb';

async function getTrendingContent() {
  try {
    // Obtener las primeras 3 páginas de trending (60 items totales)
    const pages = [1, 2, 3];
    
    const fetchPromises = pages.map(async (page) => {
      const response = await fetch(
        `https://api.themoviedb.org/3/trending/all/week?page=${page}&language=es-MX&include_adult=false`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
            'Content-Type': 'application/json',
          },
          next: { revalidate: 3600 }
        }
      );

      if (!response.ok) {
        throw new Error(`TMDb API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Filtrar contenido adulto manualmente
      const filteredResults = data.results?.filter((item: any) => {
        if (item.adult === true) return false;
        if (item.vote_count < 10) return false;
        
        // Blacklist de IDs específicos
        const blacklistedIds = [203101];
        if (blacklistedIds.includes(item.id)) return false;
        
        const suspiciousGenres = [10749];
        if (item.genre_ids?.some((id: number) => suspiciousGenres.includes(id)) && item.vote_count < 100) {
          return false;
        }
        
        const suspiciousKeywords = ['sex', 'porn', 'xxx', 'adult', 'erotic', 'ecchi', 'エロ', 'セックス', '19+', '섹시', '성인'];
        const title = (item.title || item.name || '').toLowerCase();
        const originalTitle = (item.original_title || item.original_name || '').toLowerCase();
        
        if (suspiciousKeywords.some(keyword => 
          title.includes(keyword) || originalTitle.includes(keyword)
        )) {
          return false;
        }
        
        return true;
      }) || [];
      
      return { ...data, results: filteredResults };
    });
    
    const results = await Promise.all(fetchPromises);
    
    // Combinar todos los resultados
    const allItems = results.flatMap(data => data.results || []);
    
    // Eliminar duplicados basándose en el ID
    const uniqueItems = Array.from(
      new Map(allItems.map(item => [`${item.id}-${item.media_type}`, item])).values()
    );
    
    return { results: uniqueItems };
  } catch (error) {
    logger.error('❌ [HOME] Error fetching trending:', error);
    return { results: [] };
  }
}

async function getPopularMovies() {
  try {
    const res = await fetch(
      'https://api.themoviedb.org/3/movie/popular?language=es-MX&page=1',
      {
        headers: {
          'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 3600 }
      }
    );
    
    if (!res.ok) {
      throw new Error(`Failed to fetch popular movies: ${res.status}`);
    }
    
    const data = await res.json();
    // Agregar media_type a cada item
    return {
      ...data,
      results: data.results?.map((item: any) => ({ ...item, media_type: 'movie' })) || []
    };
  } catch (error) {
    logger.error('❌ [HOME] Error fetching popular movies:', error);
    return { results: [] };
  }
}

async function getPopularTVShows() {
  try {
    const res = await fetch(
      'https://api.themoviedb.org/3/tv/popular?language=es-MX&page=1',
      {
        headers: {
          'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 3600 }
      }
    );
    
    if (!res.ok) {
      throw new Error(`Failed to fetch popular TV shows: ${res.status}`);
    }
    
    const data = await res.json();
    // Agregar media_type a cada item
    return {
      ...data,
      results: data.results?.map((item: any) => ({ ...item, media_type: 'tv' })) || []
    };
  } catch (error) {
    logger.error('❌ [HOME] Error fetching popular TV shows:', error);
    return { results: [] };
  }
}

async function getTopRatedMovies() {
  try {
    const res = await fetch(
      'https://api.themoviedb.org/3/movie/top_rated?language=es-MX&page=1',
      {
        headers: {
          'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 3600 }
      }
    );
    
    if (!res.ok) {
      throw new Error(`Failed to fetch top rated movies: ${res.status}`);
    }
    
    const data = await res.json();
    // Agregar media_type a cada item
    return {
      ...data,
      results: data.results?.map((item: any) => ({ ...item, media_type: 'movie' })) || []
    };
  } catch (error) {
    logger.error('❌ [HOME] Error fetching top rated movies:', error);
    return { results: [] };
  }
}

async function getTopRatedTVShows() {
  try {
    const res = await fetch(
      'https://api.themoviedb.org/3/tv/top_rated?language=es-MX&page=1',
      {
        headers: {
          'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 3600 }
      }
    );
    
    if (!res.ok) {
      throw new Error(`Failed to fetch top rated TV shows: ${res.status}`);
    }
    
    const data = await res.json();
    // Agregar media_type a cada item
    return {
      ...data,
      results: data.results?.map((item: any) => ({ ...item, media_type: 'tv' })) || []
    };
  } catch (error) {
    logger.error('❌ [HOME] Error fetching top rated TV shows:', error);
    return { results: [] };
  }
}

async function getContentByGenre(genreId: string, mediaType: 'movie' | 'tv') {
  try {
    const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
    // Filtrar por contenido con suficientes votos (popular mundialmente) y excluir idiomas menos comunes
    const res = await fetch(
      `https://api.themoviedb.org/3/discover/${endpoint}?with_genres=${genreId}&page=1&language=es-MX&sort_by=popularity.desc&include_adult=false&vote_count.gte=100`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.TMDB_BEARER}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 3600 }
      }
    );
    
    if (!res.ok) {
      throw new Error(`Failed to fetch genre content: ${res.status}`);
    }
    
    const data = await res.json();
    
    // Filtrar adicional: excluir contenido de regiones menos populares mundialmente
    const filteredResults = data.results?.filter((item: any) => {
      // Mínimo 100 votos para asegurar cierta popularidad
      if (item.vote_count < 100) return false;
      
      // Blacklist de IDs específicos
      const blacklistedIds = [203101];
      if (blacklistedIds.includes(item.id)) return false;
      
      // Excluir idiomas originales menos comunes globalmente
      const lessCommonLanguages = ['hi', 'ar', 'ta', 'te', 'ml', 'th', 'id', 'vi', 'tr', 'fa', 'bn', 'mr', 'ur'];
      if (lessCommonLanguages.includes(item.original_language)) return false;
      
      // Excluir contenido con keywords sospechosas
      const suspiciousKeywords = ['sex', 'porn', 'xxx', 'adult', 'erotic', 'ecchi', 'エロ', 'セックス', '19+', '섹시', '성인'];
      const title = (item.title || item.name || '').toLowerCase();
      const originalTitle = (item.original_title || item.original_name || '').toLowerCase();
      
      if (suspiciousKeywords.some(keyword => 
        title.includes(keyword) || originalTitle.includes(keyword)
      )) {
        return false;
      }
      
      return true;
    }) || [];
    
    // Agregar media_type a cada item
    return {
      ...data,
      results: filteredResults.map((item: any) => ({ ...item, media_type: mediaType }))
    };
  } catch (error) {
    logger.error(`❌ [HOME] Error fetching genre ${genreId}:`, error);
    return { results: [] };
  }
}



export default async function HomePage() {
  try {
    const [
      trendingData, 
      popularMoviesData, 
      popularTVData,
      topRatedMoviesData,
      topRatedTVData,
      actionMoviesData,
      comedyMoviesData,
      dramaMoviesData,
      scifiMoviesData,
      horrorMoviesData,
      romanceMoviesData
    ] = await Promise.all([
      getTrendingContent(),
      getPopularMovies(),
      getPopularTVShows(),
      getTopRatedMovies(),
      getTopRatedTVShows(),
      getContentByGenre('28', 'movie'), // Acción
      getContentByGenre('35', 'movie'), // Comedia
      getContentByGenre('18', 'movie'), // Drama
      getContentByGenre('878', 'movie'), // Ciencia Ficción
      getContentByGenre('27', 'movie'), // Terror
      getContentByGenre('10749', 'movie'), // Romance
    ]);

    // Filtrar y seleccionar los 6 items MÁS POPULARES (excluir contenido adulto y películas de animación)
    const trendingItems = (trendingData.results || [])
      .filter((item: MediaItem) => {
        if (item.media_type !== 'movie' && item.media_type !== 'tv') return false;
        if (item.adult) return false;
        // Solo ocultar animación para películas, no para series
        if (item.media_type === 'movie' && item.genre_ids?.includes(16)) return false;
        
        // ⚡ Filtrar por disponibilidad SIN hacer fetch extra
        const releaseDate = item.release_date || item.first_air_date;
        if (!releaseDate) return false;
        
        // Series siempre disponibles
        if (item.media_type === 'tv') return true;
        
        // Películas: solo si han pasado 60 días desde el estreno
        const daysSinceRelease = Math.floor(
          (Date.now() - new Date(releaseDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysSinceRelease >= 60;
      });
    
    // Ordenar por popularidad (de mayor a menor)
    const sortedByPopularity = [...trendingItems].sort((a, b) => 
      b.popularity - a.popularity
    );
    
    // Tomar los 6 más populares
    const featuredItems = sortedByPopularity.slice(0, 6);

    // Sistema de filtrado de duplicados entre carruseles
    const seenIds = new Set<string>();
    
    const filterDuplicates = (items: MediaItem[], maxItems: number = 20): MediaItem[] => {
      const filtered: MediaItem[] = [];
      
      for (const item of items) {
        const uniqueKey = `${item.id}-${item.media_type}`;
        if (!seenIds.has(uniqueKey)) {
          seenIds.add(uniqueKey);
          filtered.push(item);
          if (filtered.length >= maxItems) break;
        }
      }
      
      return filtered;
    };

    // Filtrar cada carrusel en orden
    const trendingFiltered = filterDuplicates(trendingData.results || []);

    return (
      <div className="min-h-screen bg-black">
        {/* Hero Section */}
        <HeroSection featuredItems={featuredItems} />

        {/* Content Sections - Superpuestas al hero estilo Netflix */}
        <div className="relative -mt-40 z-40 pb-12 space-y-8">
          {/* Trending Content */}
          <section>
            <Suspense fallback={<LoadingSpinner />}>
              <MediaCarousel 
                title="Tendencias de la semana" 
                items={trendingFiltered} 
              />
            </Suspense>
          </section>

          {/* Continue Watching Section */}
          <Suspense fallback={null}>
            <ContinueWatching />
          </Suspense>

          {/* Platforms Section */}
          <section>
            <PlatformsCarousel showAllLink={true} />
          </section>

          {/* Lucky Pick Section */}
          <section>
            <LuckyPick />
          </section>

          {/* Popular Movies */}
          <section>
            <Suspense fallback={<LoadingSpinner />}>
              <MediaCarousel 
                title="Películas populares" 
                items={filterDuplicates(popularMoviesData.results || [])} 
              />
            </Suspense>
          </section>

          {/* Popular TV Shows */}
          <section>
            <Suspense fallback={<LoadingSpinner />}>
              <MediaCarousel 
                title="Series populares" 
                items={filterDuplicates(popularTVData.results || [])} 
              />
            </Suspense>
          </section>

          {/* Because You Watched Section */}
          <Suspense fallback={null}>
            <BecauseYouWatched />
          </Suspense>

          {/* Action Movies */}
          <section>
            <Suspense fallback={<LoadingSpinner />}>
              <MediaCarousel 
                title="Acción" 
                items={filterDuplicates(actionMoviesData.results || [])} 
              />
            </Suspense>
          </section>

          {/* Comedy Movies */}
          <section>
            <Suspense fallback={<LoadingSpinner />}>
              <MediaCarousel 
                title="Comedia" 
                items={filterDuplicates(comedyMoviesData.results || [])} 
              />
            </Suspense>
          </section>

          {/* Drama Movies */}
          <section>
            <Suspense fallback={<LoadingSpinner />}>
              <MediaCarousel 
                title="Drama" 
                items={filterDuplicates(dramaMoviesData.results || [])} 
              />
            </Suspense>
          </section>

          {/* Top Rated Movies */}
          <section>
            <Suspense fallback={<LoadingSpinner />}>
              <MediaCarousel 
                title="Películas mejor valoradas" 
                items={filterDuplicates(topRatedMoviesData.results || [])} 
              />
            </Suspense>
          </section>

          {/* Sci-Fi Movies */}
          <section>
            <Suspense fallback={<LoadingSpinner />}>
              <MediaCarousel 
                title="Ciencia Ficción" 
                items={filterDuplicates(scifiMoviesData.results || [])} 
              />
            </Suspense>
          </section>

          {/* Horror Movies */}
          <section>
            <Suspense fallback={<LoadingSpinner />}>
              <MediaCarousel 
                title="Terror" 
                items={filterDuplicates(horrorMoviesData.results || [])} 
              />
            </Suspense>
          </section>

          {/* Romance Movies */}
          <section>
            <Suspense fallback={<LoadingSpinner />}>
              <MediaCarousel 
                title="Romance" 
                items={filterDuplicates(romanceMoviesData.results || [])} 
              />
            </Suspense>
          </section>

          {/* Top Rated TV Shows */}
          <section>
            <Suspense fallback={<LoadingSpinner />}>
              <MediaCarousel 
                title="Series mejor valoradas" 
                items={filterDuplicates(topRatedTVData.results || [])} 
              />
            </Suspense>
          </section>
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Error al cargar el contenido</h1>
          <p className="text-gray-400">Por favor, intenta recargar la página.</p>
        </div>
      </div>
    );
  }
}
