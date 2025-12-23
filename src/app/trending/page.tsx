'use client';

import { logger } from '@/lib/logger';
import { useEffect, useState } from 'react';
import MediaGrid from '@/components/MediaGrid';
import LoadingSpinner from '@/components/LoadingSpinner';
import { MediaItem } from '@/types/tmdb';
import { isAvailableForStreaming } from '@/lib/tmdb';

export default function TrendingPage() {
  const [trendingItems, setTrendingItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrending = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/trending');
        
        if (!response.ok) {
          throw new Error('Error al cargar el contenido trending');
        }
        
        const data = await response.json();
        // Filtrar solo películas y series (excluir contenido adulto)
        const filteredItems = data.results.filter((item: MediaItem) => 
          (item.media_type === 'movie' || item.media_type === 'tv') &&
          !item.adult
        );
        
        // Verificar disponibilidad de streaming asíncronamente
        const availabilityChecks = await Promise.all(
          filteredItems.map(async (item: MediaItem) => ({
            item,
            isAvailable: await isAvailableForStreaming(item, item.media_type)
          }))
        );
        
        const availableItems = availabilityChecks
          .filter(({ isAvailable }) => isAvailable)
          .map(({ item }) => item);
        
        setTrendingItems(availableItems);
      } catch (err) {
        setError('Error al cargar el contenido trending');
        logger.error('Error fetching trending:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrending();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black pt-32 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-white mb-8">Tendencias</h1>
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
            <h1 className="text-4xl font-bold text-white mb-4">Tendencias</h1>
            <p className="text-red-500 text-lg">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pt-32 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold text-white mb-8">Tendencias</h1>
        <p className="text-gray-400 mb-6">
          Lo más popular esta semana en películas y series
        </p>
        <MediaGrid items={trendingItems} />
      </div>
    </div>
  );
}