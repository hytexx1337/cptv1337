'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FilmIcon, HomeIcon } from '@heroicons/react/24/solid';

export default function NotFound() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black flex items-center justify-center px-4">
      <div className={`text-center space-y-8 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* 404 Grande */}
        <div className="relative">
          <h1 className="text-9xl md:text-[200px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-red-400 leading-none">
            404
          </h1>
          <FilmIcon className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 md:w-32 md:h-32 text-red-600/20 animate-pulse" />
        </div>

        {/* Mensaje */}
        <div className="space-y-4">
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            ¡Ups! Página no encontrada
          </h2>
          <p className="text-gray-400 text-lg md:text-xl max-w-md mx-auto">
            Parece que esta película no está en nuestro catálogo... o la URL que buscás no existe.
          </p>
        </div>

        {/* Botones */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
          >
            <HomeIcon className="w-6 h-6" />
            Volver al Inicio
          </Link>
          
          <Link
            href="/movies"
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-200 text-black px-8 py-4 rounded-lg font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
          >
            <FilmIcon className="w-6 h-6" />
            Explorar Películas
          </Link>
        </div>

        {/* Sugerencias */}
        <div className="pt-12 text-sm text-gray-500">
          <p>Sugerencias:</p>
          <ul className="mt-2 space-y-1">
            <li>Verificá que la URL esté escrita correctamente</li>
            <li>Usá el buscador para encontrar lo que necesitás</li>
            <li>Explorá nuestro catálogo de películas y series</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

