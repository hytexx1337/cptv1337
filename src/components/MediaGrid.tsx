'use client';

import { MediaItem } from '@/types/tmdb';
import MediaCard from './MediaCard';

interface MediaGridProps {
  items: MediaItem[];
  title?: string;
}

export default function MediaGrid({ items, title }: MediaGridProps) {
  // Filtrar contenido adulto por si acaso
  const filteredItems = items?.filter(item => !item.adult) || [];

  if (!filteredItems || filteredItems.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">No se encontraron resultados.</p>
      </div>
    );
  }

  return (
    <div className="mb-16">
      {title && (
        <h2 className="text-3xl font-bold text-white mb-8 tracking-tight">{title}</h2>
      )}
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
        {filteredItems.map((item) => (
          <MediaCard key={`${item.id}-${item.media_type || 'unknown'}`} item={item} />
        ))}
      </div>
    </div>
  );
}