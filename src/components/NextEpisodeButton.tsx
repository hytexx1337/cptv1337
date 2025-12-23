'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface NextEpisodeButtonProps {
  currentTime: number;
  duration: number;
  creditsStart: number;
  creditsEnd: number;
  onNextEpisode: () => void;
  isFullscreen: boolean;
  nextEpisodeTitle?: string;
  hasNextEpisode: boolean;
}

const NextEpisodeButton: React.FC<NextEpisodeButtonProps> = ({
  currentTime,
  duration,
  creditsStart,
  creditsEnd,
  onNextEpisode,
  isFullscreen,
  nextEpisodeTitle,
  hasNextEpisode
}) => {
  const [showButton, setShowButton] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [countdown, setCountdown] = useState(10);

  // DEBUG: Log de props
  useEffect(() => {
    console.log('🎬 [NEXT-EPISODE-BUTTON] Props:', {
      hasNextEpisode,
      currentTime: currentTime.toFixed(2),
      duration: duration.toFixed(2),
      creditsStart,
      creditsEnd,
      inCreditsRange: currentTime >= creditsStart && currentTime <= creditsEnd,
      inLastSeconds: duration > 0 && currentTime >= (duration - 30),
      showButton,
    });
  }, [currentTime, creditsStart, creditsEnd, duration, hasNextEpisode, showButton]);

  useEffect(() => {
    if (!hasNextEpisode) return;

    // Mostrar botón si estamos en el rango de créditos o en los últimos 30 segundos
    const inCreditsRange = currentTime >= creditsStart && currentTime <= creditsEnd;
    const inLastSeconds = duration > 0 && currentTime >= (duration - 30);
    const shouldShow = inCreditsRange || inLastSeconds;
    
    if (shouldShow && !showButton) {
      setShowButton(true);
      setFadeOut(false);
      // Iniciar countdown desde 10 segundos
      setCountdown(10);
    } else if (!shouldShow && showButton) {
      // Fade out antes de ocultar
      setFadeOut(true);
      setTimeout(() => {
        setShowButton(false);
        setFadeOut(false);
      }, 300);
    }
  }, [currentTime, creditsStart, creditsEnd, duration, showButton, hasNextEpisode]);

  // Countdown automático
  useEffect(() => {
    if (!showButton || fadeOut) return;

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Auto-play siguiente episodio
          handleNextEpisode();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showButton, fadeOut]);

  const handleNextEpisode = () => {
    setFadeOut(true);
    setTimeout(() => {
      onNextEpisode();
      setShowButton(false);
      setFadeOut(false);
    }, 150);
  };

  const handleCancel = () => {
    setFadeOut(true);
    setTimeout(() => {
      setShowButton(false);
      setFadeOut(false);
    }, 300);
  };

  if (!showButton || !hasNextEpisode) return null;

  // Estilos comunes para el componente
  const componentStyles = {
    fontFamily: 'var(--font-poppins), Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  const buttonElement = (
    <div
      className={`fixed z-50 transition-all duration-300 ${
        fadeOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
      } ${
        isFullscreen 
          ? 'bottom-[148px] right-8' 
          : 'bottom-[164px] right-8'
      }`}
      style={componentStyles}
    >
      <div className="bg-black/90 backdrop-blur-sm border border-white/20 rounded-lg p-4 min-w-[300px]">
        {/* Título del siguiente episodio */}
        <div className="text-white text-sm mb-3">
          <div className="text-gray-300 text-xs mb-1" style={{ letterSpacing: '0.02em' }}>Siguiente episodio:</div>
          <div className="font-semibold truncate" style={{ letterSpacing: '0.01em' }}>
            {nextEpisodeTitle || 'Próximo episodio'}
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <button
            onClick={handleNextEpisode}
            className="flex-1 bg-white/95 hover:bg-white text-black px-4 py-2 rounded-md font-semibold
                       transition-all duration-200 hover:scale-105 
                       active:scale-95 flex items-center justify-center gap-2"
            style={{ fontSize: '14px', letterSpacing: '0.02em' }}
          >
            <svg 
              className="w-4 h-4" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              strokeWidth={2.5}
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                d="M13 5l7 7-7 7M5 5l7 7-7 7" 
              />
            </svg>
            Reproducir ({countdown}s)
          </button>
          
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-white font-medium border border-white/30 rounded-md 
                       hover:bg-white/10 transition-all duration-200"
            style={{ fontSize: '14px', letterSpacing: '0.02em' }}
          >
            Cancelar
          </button>
        </div>

        {/* Barra de progreso del countdown */}
        <div className="mt-3 bg-gray-700 rounded-full h-1 overflow-hidden">
          <div 
            className="bg-white h-full transition-all duration-1000 ease-linear"
            style={{ width: `${((10 - countdown) / 10) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );

  // Si estamos en fullscreen, renderizar en el contenedor de Video.js
  if (isFullscreen) {
    const videoContainer = document.querySelector('.video-js');
    if (videoContainer) {
      return createPortal(buttonElement, videoContainer);
    }
  }

  // En modo normal, renderizar directamente
  return buttonElement;
};

export default NextEpisodeButton;