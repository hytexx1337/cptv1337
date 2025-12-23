'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

interface NextUpOverlayProps {
  currentTime: number;
  duration: number;
  creditsStart?: number; // Inicio de créditos desde intro-timings
  creditsEnd?: number; // Fin de créditos desde intro-timings
  nextEpisode: {
    season: number;
    episode: number;
    title?: string;
    stillPath?: string;
  } | null;
  onPlayNext: () => void;
  isFullscreen: boolean;
}

const NextUpOverlay: React.FC<NextUpOverlayProps> = ({
  currentTime,
  duration,
  creditsStart,
  creditsEnd,
  nextEpisode,
  onPlayNext,
  isFullscreen
}) => {
  const [showOverlay, setShowOverlay] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [totalDuration, setTotalDuration] = useState(10); // Duración total del overlay

  useEffect(() => {
    if (!nextEpisode || duration === 0) return;

    let shouldShow = false;
    let timeRemaining = 0;
    let maxDuration = 10; // Duración total para normalizar el círculo

    // Si hay creditsStart definido, mostrar cuando empiecen los créditos
    if (creditsStart !== undefined && creditsEnd !== undefined) {
      const inCreditsRange = currentTime >= creditsStart && currentTime <= creditsEnd;
      shouldShow = inCreditsRange && !isHidden;
      timeRemaining = creditsEnd - currentTime;
      maxDuration = creditsEnd - creditsStart; // Duración completa de los créditos
    } else {
      // Si no hay créditos definidos, mostrar en los últimos 10 segundos
      timeRemaining = duration - currentTime;
      shouldShow = timeRemaining > 0 && timeRemaining <= 10 && !isHidden;
      maxDuration = 10; // Solo 10 segundos
    }

    if (shouldShow && !showOverlay) {
      console.log('✅ [NEXT-UP] Mostrando overlay');
      setShowOverlay(true);
      setCountdown(Math.ceil(timeRemaining));
      setTotalDuration(maxDuration);
    } else if (!shouldShow && showOverlay) {
      console.log('❌ [NEXT-UP] Ocultando overlay');
      setShowOverlay(false);
    }
    
    // Actualizar countdown con el tiempo total correcto
    if (shouldShow) {
      setCountdown(Math.ceil(timeRemaining));
    }
  }, [currentTime, duration, creditsStart, creditsEnd, nextEpisode, showOverlay, isHidden]);

  const handleHide = () => {
    setIsHidden(true);
    setShowOverlay(false);
  };

  if (!showOverlay || !nextEpisode) return null;

  const overlayElement = (
    <div
      className="fixed bottom-[164px] right-8 z-[9999] transition-all duration-300"
      style={{
        fontFamily: 'var(--font-poppins), Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div className="bg-black/90 backdrop-blur-md rounded-lg overflow-hidden shadow-2xl w-[380px]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-white text-lg font-semibold">Next Up</h3>
          <button
            onClick={handleHide}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Hide"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Thumbnail con botón de play */}
        <div className="relative group cursor-pointer" onClick={onPlayNext}>
          <div className="relative w-full aspect-video bg-gray-800">
            {nextEpisode.stillPath ? (
              <Image
                src={nextEpisode.stillPath}
                alt={`S${nextEpisode.season}E${nextEpisode.episode}`}
                fill
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/40">
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16" />
                </svg>
              </div>
            )}
            
            {/* Overlay oscuro en hover */}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            {/* Botón de play centrado con círculo de progreso */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-20 h-20">
                {/* Círculo de fondo transparente */}
                <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 80 80">
                  {/* Círculo de fondo */}
                  <circle
                    cx="40"
                    cy="40"
                    r="36"
                    stroke="rgba(255, 255, 255, 0.2)"
                    strokeWidth="4"
                    fill="none"
                  />
                  {/* Círculo de progreso */}
                  <circle
                    cx="40"
                    cy="40"
                    r="36"
                    stroke="rgba(255, 255, 255, 0.9)"
                    strokeWidth="4"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 36}`}
                    strokeDashoffset={`${2 * Math.PI * 36 * (countdown / totalDuration)}`}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-linear"
                  />
                </svg>
                
                {/* Botón de play centrado */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-white/20 group-hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-all">
                    <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Info del episodio */}
          <div className="p-4">
            <div className="text-sm text-white/60 mb-1">
              Episodio {nextEpisode.episode}
            </div>
            <h4 className="text-white font-medium line-clamp-2">
              {nextEpisode.title || `Episode ${nextEpisode.episode}`}
            </h4>
          </div>
        </div>
      </div>
    </div>
  );

  // Si estamos en fullscreen, renderizar en el contenedor de Video.js
  if (isFullscreen) {
    const videoContainer = document.querySelector('.video-js');
    if (videoContainer) {
      return createPortal(overlayElement, videoContainer);
    }
  }

  // En modo normal, renderizar directamente
  return overlayElement;
};

export default NextUpOverlay;

