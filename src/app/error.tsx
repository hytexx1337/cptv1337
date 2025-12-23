'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ExclamationTriangleIcon, HomeIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log del error para debugging
    console.error('Error capturado:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black flex items-center justify-center px-4">
      <div className="text-center space-y-8 max-w-2xl">
        {/* Icono de error */}
        <div className="flex justify-center">
          <ExclamationTriangleIcon className="w-32 h-32 text-red-500 animate-pulse" />
        </div>

        {/* Mensaje principal */}
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold text-white">
            ¡Algo salió mal!
          </h1>
          <p className="text-gray-400 text-lg md:text-xl">
            Lo sentimos, ocurrió un error inesperado. Nuestro equipo ha sido notificado.
          </p>
        </div>

        {/* Detalles del error (solo en desarrollo) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-left">
            <p className="text-red-400 text-sm font-mono break-all">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-red-300 text-xs mt-2">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
          >
            <ArrowPathIcon className="w-6 h-6" />
            Intentar de nuevo
          </button>
          
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-200 text-black px-8 py-4 rounded-lg font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
          >
            <HomeIcon className="w-6 h-6" />
            Volver al Inicio
          </Link>
        </div>

        {/* Información adicional */}
        <div className="pt-12 text-sm text-gray-500 space-y-2">
          <p>Si el problema persiste, por favor:</p>
          <ul className="mt-2 space-y-1">
            <li>Refrescá la página (Ctrl+F5 o Cmd+Shift+R)</li>
            <li>Limpiá el caché del navegador</li>
            <li>Intentá de nuevo en unos minutos</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

