'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { getImageUrl } from '@/lib/tmdb';
import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid';
import PreviewPlayer from '@/components/PreviewPlayer';

interface DetailHeroSectionProps {
  backdropPath: string | null;
  title: string;
  logo?: {
    file_path: string;
  } | null;
  children: React.ReactNode;
  imdbId?: string;
  tmdbId: number;
  type: 'movie' | 'tv';
  season?: number; // Para series
  episode?: number; // Para series
  onMuteStateChange?: (showButton: boolean, isMuted: boolean, onToggle: () => void) => void;
}

export default function DetailHeroSection({ 
  backdropPath, 
  title, 
  logo,
  children,
  imdbId,
  tmdbId,
  type,
  season = 1,
  episode = 1,
  onMuteStateChange,
}: DetailHeroSectionProps) {
  const [loadPreview, setLoadPreview] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showMuteButton, setShowMuteButton] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [previewPlayerRef, setPreviewPlayerRef] = useState<{ toggleMute: () => void } | null>(null);

  // Cargar preview después de 2 segundos
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadPreview(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Callback cuando el preview está listo (memoizado)
  const handlePreviewReady = useCallback(() => {
    // Fade in del preview con delay para transición suave
    setTimeout(() => {
      setShowPreview(true);
      // Mostrar botón de mute después del fade-in
      setTimeout(() => {
        setShowMuteButton(true);
      }, 500);
    }, 100);
  }, []);

  // Callback cuando el preview termina (memoizado)
  const handlePreviewEnded = useCallback(() => {
    // Ocultar botón de mute primero
    setShowMuteButton(false);
    // Fade out del preview y volver al backdrop
    setShowPreview(false);
    // Esperar 1.5 segundos (fade-out completo + margin) antes de desmontar
    setTimeout(() => {
      setLoadPreview(false);
    }, 1500);
  }, []);

  // Toggle mute
  const handleMuteToggle = useCallback(() => {
    if (previewPlayerRef) {
      previewPlayerRef.toggleMute();
    }
  }, [previewPlayerRef]);

  // Notificar al padre cuando cambia el estado del mute
  useEffect(() => {
    if (onMuteStateChange) {
      onMuteStateChange(showMuteButton, isMuted, handleMuteToggle);
    }
  }, [showMuteButton, isMuted, handleMuteToggle, onMuteStateChange]);

  return (
    <div className="relative h-screen pt-24 bg-black">
      {/* Backdrop Image con el mismo estilo que HeroSection */}
      {backdropPath && (
        <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${showPreview ? 'opacity-0' : 'opacity-100'}`}>
          <Image
            src={getImageUrl(backdropPath, 'original')}
            alt={title}
            fill
            className="object-cover"
            style={{ objectPosition: 'center center' }}
            priority
          />
        </div>
      )}

      {/* Preview Player - Aparece con fade-in suave */}
      {loadPreview && (
        <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${showPreview ? 'opacity-100' : 'opacity-0'}`}>
          <PreviewPlayer
            type={type}
            tmdbId={tmdbId}
            imdbId={imdbId}
            title={title}
            season={season}
            episode={episode}
            onReady={handlePreviewReady}
            onEnded={handlePreviewEnded}
            onError={(error) => console.error('[PREVIEW] Error:', error)}
            onMuteChange={setIsMuted}
            onPlayerRef={setPreviewPlayerRef}
          />
        </div>
      )}

      {/* Gradientes estilo Netflix - Copiados exactos del HeroSection */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {/* Gradiente superior */}
        <div 
          className="absolute top-0 left-0 right-0 h-[400px]"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.5) 25%, rgba(0,0,0,0.3) 50%, transparent 100%)'
          }} 
        />

        {/* Gradiente inferior - MÁS OSCURO para mejor legibilidad */}
        <div className="absolute bottom-0 left-0 right-0 h-[450px]">
          <div 
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 20%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,0.5) 65%, rgba(0,0,0,0.2) 85%, transparent 100%)'
            }} 
          />
        </div>

        {/* Gradiente izquierdo - EXTRA ANCHO para máxima legibilidad */}
        <div 
          className="absolute top-0 bottom-0 left-0 w-[70%]"
          style={{
            background: 'linear-gradient(to right, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.92) 25%, rgba(0,0,0,0.8) 45%, rgba(0,0,0,0.5) 65%, rgba(0,0,0,0.2) 85%, transparent 100%)'
          }} 
        />

        {/* Gradiente derecho */}
        <div 
          className="absolute top-0 bottom-0 right-0 w-[300px]"
          style={{
            background: 'linear-gradient(to left, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)'
          }} 
        />
      </div>

      {/* Content Overlay */}
      <div className="absolute inset-0 flex items-end z-20 pb-16 md:pb-24 lg:pb-32">
        <div className="px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16">
          <div className="max-w-3xl">
          {/* Logo o Título */}
          {logo ? (
            <div className="mb-4 md:mb-6 lg:mb-8">
              <img
                src={`https://image.tmdb.org/t/p/w500${logo.file_path}`}
                alt={title}
                className="w-full h-auto"
                style={{ 
                  maxWidth: '300px',
                  maxHeight: '120px',
                  objectFit: 'contain', 
                  objectPosition: 'left',
                  filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.9)) drop-shadow(0 0 16px rgba(0,0,0,0.5))'
                }}
              />
            </div>
          ) : (
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-white mb-4 md:mb-6 leading-tight drop-shadow-2xl">
              {title}
            </h1>
          )}

            {/* Children content (metadata, buttons, etc.) */}
            {children}
          </div>
        </div>
      </div>

    </div>
  );
}
