'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';

interface Genre {
  id: string;
  name: string;
  gradient: string;
  icon: string;
}

const genres: Genre[] = [
  { id: '28', name: 'Acción', gradient: 'from-red-500 to-orange-600', icon: '💥' },
  { id: '12', name: 'Aventura', gradient: 'from-green-500 to-teal-600', icon: '🗺️' },
  { id: '16', name: 'Animación', gradient: 'from-pink-500 to-purple-600', icon: '🎨' },
  { id: '35', name: 'Comedia', gradient: 'from-yellow-500 to-orange-500', icon: '😂' },
  { id: '80', name: 'Crimen', gradient: 'from-gray-700 to-gray-900', icon: '🔫' },
  { id: '18', name: 'Drama', gradient: 'from-purple-600 to-indigo-700', icon: '🎭' },
  { id: '10751', name: 'Familia', gradient: 'from-blue-400 to-cyan-500', icon: '👨‍👩‍👧‍👦' },
  { id: '14', name: 'Fantasía', gradient: 'from-violet-500 to-purple-700', icon: '🔮' },
  { id: '27', name: 'Terror', gradient: 'from-red-900 to-black', icon: '👻' },
  { id: '10749', name: 'Romance', gradient: 'from-pink-400 to-rose-600', icon: '💕' },
  { id: '878', name: 'Ciencia Ficción', gradient: 'from-blue-600 to-indigo-900', icon: '🚀' },
  { id: '53', name: 'Suspenso', gradient: 'from-slate-600 to-slate-900', icon: '😰' },
];

export default function GenresCarousel() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 400;
      const newScrollPosition = scrollContainerRef.current.scrollLeft + 
        (direction === 'left' ? -scrollAmount : scrollAmount);
      
      scrollContainerRef.current.scrollTo({
        left: newScrollPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="container mx-auto px-4">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl md:text-3xl font-bold text-white">
          Explorar por género
        </h2>
      </div>

      <div className="relative group/carousel">
        {/* Botón anterior */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/70 hover:bg-black/90 text-white p-3 rounded-full opacity-0 group-hover/carousel:opacity-100 transition-all duration-300 -translate-x-4 group-hover/carousel:translate-x-0"
        >
          <ChevronLeftIcon className="w-6 h-6" />
        </button>

        {/* Botón siguiente */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/70 hover:bg-black/90 text-white p-3 rounded-full opacity-0 group-hover/carousel:opacity-100 transition-all duration-300 translate-x-4 group-hover/carousel:translate-x-0"
        >
          <ChevronRightIcon className="w-6 h-6" />
        </button>

        {/* Scroll container */}
        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth px-2 py-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {genres.map((genre) => (
            <Link
              key={genre.id}
              href={`/genre/${genre.id}`}
              className="group flex-shrink-0"
            >
              <div className={`
                relative w-48 h-32 rounded-2xl overflow-hidden
                bg-gradient-to-br ${genre.gradient}
                shadow-lg transition-all duration-300
                group-hover:scale-105 group-hover:shadow-2xl
              `}>
                {/* Pattern de fondo */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute inset-0" style={{
                    backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                    backgroundSize: '24px 24px'
                  }} />
                </div>

                {/* Icono grande de fondo */}
                <div className="absolute -bottom-4 -right-4 text-8xl opacity-20 group-hover:scale-110 transition-transform duration-300">
                  {genre.icon}
                </div>

                {/* Contenido */}
                <div className="relative h-full flex flex-col justify-between p-5">
                  <div className="text-3xl">{genre.icon}</div>
                  <div>
                    <h3 className="text-xl font-bold text-white drop-shadow-lg">
                      {genre.name}
                    </h3>
                  </div>
                </div>

                {/* Overlay en hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

