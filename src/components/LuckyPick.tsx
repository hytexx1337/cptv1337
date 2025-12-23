'use client';

import { logger } from '@/lib/logger';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LuckyPick() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<'movie' | 'tv' | null>(null);

  const getRandomContent = async (type: 'movie' | 'tv') => {
    setIsLoading(true);
    setSelectedType(type);

    try {
      // Obtener una página aleatoria (entre 1 y 5)
      const randomPage = Math.floor(Math.random() * 5) + 1;
      
      // Fetch del endpoint correspondiente
      const endpoint = type === 'movie' ? 'movies' : 'tv';
      const response = await fetch(`/api/${endpoint}/popular?page=${randomPage}`);
      
      if (!response.ok) {
        throw new Error('Error al obtener contenido');
      }

      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        // Seleccionar un item aleatorio de los resultados
        const randomIndex = Math.floor(Math.random() * data.results.length);
        const randomItem = data.results[randomIndex];
        
        // Redirigir a la página del item
        router.push(`/${type}/${randomItem.id}`);
      }
    } catch (error) {
      logger.error('Error getting random content:', error);
      setIsLoading(false);
      setSelectedType(null);
    }
  };

  return (
    <div className="container mx-auto px-4">
      <div className="max-w-5xl mx-auto">
        {/* Card contenedor con glassmorphism */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm border border-white/10 p-12">
          {/* Pattern de fondo */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0" style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
              backgroundSize: '32px 32px'
            }} />
          </div>
          
          {/* Contenido */}
          <div className="relative">
            {/* Título centrado */}
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-medium text-white mb-3">
                ¿No sabés qué ver?
              </h2>
              <p className="text-white/60 text-lg">
                Dejá que nosotros elijamos por vos
              </p>
            </div>

            {/* Botones lado a lado */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-stretch">
              {/* Botón Películas */}
              <button
                onClick={() => getRandomContent('movie')}
                disabled={isLoading}
                className={`group relative flex-1 sm:max-w-xs overflow-hidden rounded-2xl bg-white/10 hover:bg-white/15 backdrop-blur-sm border border-white/20 p-6 transition-all duration-300 ${
                  isLoading && selectedType === 'movie'
                    ? 'scale-95 opacity-50'
                    : 'hover:scale-105 hover:border-white/30'
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Ícono */}
                  <div className="flex-shrink-0">
                    <svg className={`w-12 h-12 ${isLoading && selectedType === 'movie' ? 'animate-pulse' : ''}`} viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" fill="#ffffff">
                      <path d="M478.4 221.3c-44.7 0-81 36.3-81 81s36.3 81 81 81 81-36.3 81-81-36.3-81-81-81z m32.4 288.9c0-17.9-14.5-32.4-32.4-32.4S446 492.3 446 510.2s14.5 32.4 32.4 32.4 32.4-14.5 32.4-32.4z m-113.4 208c0 44.7 36.3 81 81 81s81-36.3 81-81-36.3-81-81-81c-44.8 0-81 36.2-81 81z m207.9-208c0 44.7 36.3 81 81 81s81-36.3 81-81-36.3-81-81-81-81 36.3-81 81z m-415.9 0c0 44.7 36.3 81 81 81s81-36.3 81-81-36.3-81-81-81-81 36.3-81 81z m766.4 379.1c-30-65.3-95.7-108-167.6-108.7-37.7-0.6-74.2 10.6-105.5 31.6-0.2 0.1-0.3 0.2-0.5 0.3-60.3 40.7-130.8 62.3-203.8 62.3-201 0-364.5-163.5-364.5-364.5s163.5-364.5 364.5-364.5 364.5 163.5 364.5 364.5c0 61.7-15.7 122.6-45.3 176.2-6.5 11.7-2.2 26.5 9.5 33s26.5 2.2 33-9.5c33.6-60.8 51.4-129.8 51.4-199.7 0-227.8-185.3-413.1-413.1-413.1S65.3 282.5 65.3 510.3s185.3 413.1 413.1 413.1c82.1 0 161.4-24.1 229.4-69.6 0.2-0.1 0.5-0.2 0.7-0.4 23.4-16.1 50.8-24.1 79.3-24.2 53.1 0.5 101.7 32.1 123.9 80.4 4.1 8.9 12.9 14.2 22.1 14.2 3.4 0 6.8-0.7 10.1-2.2 12.2-5.7 17.5-20.1 11.9-32.3z" fill="#ffffff" />
                    </svg>
                  </div>
                  
                  {/* Texto */}
                  <div className="flex-1 text-left">
                    <h3 className="text-xl font-bold text-white mb-1">
                      {isLoading && selectedType === 'movie' ? 'Buscando...' : 'Película'}
                    </h3>
                    <p className="text-white/60 text-sm">
                      Contenido aleatorio
                    </p>
                  </div>
                  
                  {/* Flecha */}
                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </button>

              {/* Botón Series */}
              <button
                onClick={() => getRandomContent('tv')}
                disabled={isLoading}
                className={`group relative flex-1 sm:max-w-xs overflow-hidden rounded-2xl bg-white/10 hover:bg-white/15 backdrop-blur-sm border border-white/20 p-6 transition-all duration-300 ${
                  isLoading && selectedType === 'tv'
                    ? 'scale-95 opacity-50'
                    : 'hover:scale-105 hover:border-white/30'
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Ícono */}
                  <div className="flex-shrink-0">
                    <svg className={`w-12 h-12 ${isLoading && selectedType === 'tv' ? 'animate-pulse' : ''}`} viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" fill="#ffffff">
                      <path d="M892.9 145.2H130.1c-33.5 0-60.7 27.2-60.7 60.7v503.4c0 33.4 27.2 60.7 60.7 60.7h762.8c33.5 0 60.7-27.2 60.7-60.7V205.8c0-33.4-27.3-60.6-60.7-60.6z m8.7 564.1c0 4.8-3.9 8.7-8.7 8.7H130.1c-4.8 0-8.7-3.9-8.7-8.7V205.8c0-4.8 3.9-8.7 8.7-8.7h762.8c4.8 0 8.7 3.9 8.7 8.7v503.5zM719.3 823.9h-416c-14.4 0-26 11.6-26 26s11.6 26 26 26h416.1c14.4 0 26-11.6 26-26s-11.7-26-26.1-26z m-83.2-384.8l-173.4-104c-8-4.8-18-4.9-26.2-0.3-8.1 4.6-13.2 13.3-13.2 22.6v208c0 9.4 5 18 13.2 22.6 4 2.3 8.4 3.4 12.8 3.4 4.6 0 9.3-1.3 13.4-3.7l173.4-104c7.8-4.7 12.6-13.2 12.6-22.3 0-9.1-4.8-17.6-12.6-22.3z" fill="#ffffff" />
                    </svg>
                  </div>
                  
                  {/* Texto */}
                  <div className="flex-1 text-left">
                    <h3 className="text-xl font-bold text-white mb-1">
                      {isLoading && selectedType === 'tv' ? 'Buscando...' : 'Serie'}
                    </h3>
                    <p className="text-white/60 text-sm">
                      Contenido aleatorio
                    </p>
                  </div>
                  
                  {/* Flecha */}
                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

