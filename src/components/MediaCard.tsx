'use client';

import Image from 'next/image';
import Link from 'next/link';
import { StarIcon, PlusIcon, CheckIcon } from '@heroicons/react/24/solid';
import { getImageUrl, getYear, formatRating, getOriginalTitle, getReleaseDate, getMediaLogo } from '@/lib/tmdb';
import { MediaItem } from '@/types/tmdb';
import { useState, useEffect } from 'react';
import { isInWatchlist, toggleWatchlist } from '@/lib/watchlist';

interface MediaCardProps {
  item: MediaItem;
}

export default function MediaCard({ item }: MediaCardProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [inWatchlist, setInWatchlist] = useState(false);
  
  // Usar título traducido (name/title) en lugar del original
  const title = item.name || item.title || getOriginalTitle(item);
  const year = getYear(getReleaseDate(item));
  const rating = formatRating(item.vote_average);
  const backdropUrl = getImageUrl(item.backdrop_path, 'w780');
  const detailUrl = item.media_type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;

  // Obtener logo del contenido
  useEffect(() => {
    const fetchLogo = async () => {
      if (item.id && item.media_type) {
        const logo = await getMediaLogo(item.id, item.media_type);
        setLogoUrl(logo);
      }
    };
    fetchLogo();
  }, [item.id, item.media_type]);

  // Verificar si está en Mi lista
  useEffect(() => {
    setInWatchlist(isInWatchlist(item.id, item.media_type as 'movie' | 'tv'));
    
    const handleWatchlistUpdate = () => {
      setInWatchlist(isInWatchlist(item.id, item.media_type as 'movie' | 'tv'));
    };
    
    window.addEventListener('watchlistUpdated', handleWatchlistUpdate);
    return () => window.removeEventListener('watchlistUpdated', handleWatchlistUpdate);
  }, [item.id, item.media_type]);

  const handleToggleWatchlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    toggleWatchlist({
      id: item.id,
      type: item.media_type as 'movie' | 'tv',
      title,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date,
      first_air_date: item.first_air_date
    });
  };

  return (
    <Link href={detailUrl} prefetch={true} className="group block">
      <div className="transition-all duration-300 hover:scale-105 hover:z-10">
        {/* Backdrop Image (Horizontal) */}
        <div className="aspect-video relative overflow-hidden shadow-lg">
          <Image
            src={backdropUrl}
            alt={title}
            fill
            className="object-cover transition-all duration-300 group-hover:brightness-75"
            sizes="(max-width: 768px) 80vw, (max-width: 1200px) 40vw, 30vw"
            loading="lazy"
          />

          {/* Rating Badge - Always visible */}
          <div className="absolute top-2 right-2 bg-black/90 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1 shadow-lg">
            <StarIcon className="h-3 w-3 text-yellow-400" />
            <span className="text-white text-xs font-bold">{rating}</span>
          </div>

          {/* Media Type Badge - Always visible */}
          <div className="absolute top-2 left-2">
            <span className="bg-gradient-to-r from-blue-500 to-purple-600 text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shadow-lg">
              {item.media_type === 'movie' ? '🎬 Film' : '📺 Serie'}
            </span>
          </div>

          {/* Logo - Bottom left corner */}
          {logoUrl && (
            <div className="absolute bottom-3 left-3 max-w-[40%] z-20">
              <Image
                src={logoUrl}
                alt={`${title} logo`}
                width={200}
                height={100}
                className="object-contain drop-shadow-2xl"
                style={{ 
                  filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.9)) drop-shadow(0 0 16px rgba(0,0,0,0.5))'
                }}
              />
            </div>
          )}
          
          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-end">
            {/* Botón Mi lista - Bottom right corner */}
            <div className="p-4">
              <button
                onClick={handleToggleWatchlist}
                className={`backdrop-blur-sm rounded-full px-4 py-2 transition-all flex items-center gap-2 ${
                  inWatchlist 
                    ? 'bg-white/90 hover:bg-white' 
                    : 'bg-white/20 hover:bg-white/30'
                }`}
              >
                {inWatchlist ? (
                  <CheckIcon className="w-4 h-4 text-black" />
                ) : (
                  <PlusIcon className="w-4 h-4 text-white" />
                )}
                <span className={`text-xs font-bold ${inWatchlist ? 'text-black' : 'text-white'}`}>
                  {inWatchlist ? 'En mi lista' : 'Mi lista'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Título debajo del poster - siempre visible */}
        <div className="mt-3 group-hover:opacity-0 transition-opacity">
          <h3 className="text-white font-medium text-sm line-clamp-2">
            {title}
          </h3>
        </div>
      </div>
    </Link>
  );
}