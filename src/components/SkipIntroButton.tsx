'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface SkipIntroButtonProps {
  currentTime: number;
  introStart: number;
  introEnd: number;
  onSkip: () => void;
  isFullscreen: boolean;
}

const SkipIntroButton: React.FC<SkipIntroButtonProps> = ({
  currentTime,
  introStart,
  introEnd,
  onSkip,
  isFullscreen
}) => {
  const [showButton, setShowButton] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Mostrar botón si estamos en el rango de la intro
    const inIntroRange = currentTime >= introStart && currentTime <= introEnd;
    
    if (inIntroRange && !showButton) {
      setShowButton(true);
      setFadeOut(false);
    } else if (!inIntroRange && showButton) {
      // Fade out antes de ocultar
      setFadeOut(true);
      setTimeout(() => {
        setShowButton(false);
        setFadeOut(false);
      }, 300);
    }
  }, [currentTime, introStart, introEnd, showButton]);

  const handleSkip = () => {
    setFadeOut(true);
    setTimeout(() => {
      onSkip();
      setShowButton(false);
      setFadeOut(false);
    }, 150);
  };

  if (!showButton) return null;

  // Estilos comunes para el botón
  const buttonStyles = {
    fontFamily: 'var(--font-poppins), Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    letterSpacing: '0.02em',
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
    >
      <button
        onClick={handleSkip}
        className="bg-white/95 hover:bg-white text-black px-6 py-3 rounded-lg font-semibold
                   backdrop-blur-sm border border-gray-300 hover:border-gray-400 
                   transition-all duration-200 hover:scale-105 active:scale-95
                   shadow-lg hover:shadow-xl flex items-center gap-2"
        style={buttonStyles}
      >
        <svg 
          className="w-5 h-5" 
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
        Saltar Intro
      </button>
    </div>
  );

  // Si estamos en fullscreen, renderizar en el contenedor de Video.js
  if (isFullscreen) {
    const videoContainer = document.querySelector('.video-js');
    if (videoContainer) {
      // Crear un elemento con estilos específicos para fullscreen usando estilos inline
      const fullscreenButtonElement = (
        <div
          style={{
            position: 'fixed',
            bottom: '140px',
            right: '32px',
            zIndex: 9999,
            opacity: fadeOut ? 0 : 1,
            transform: fadeOut ? 'scale(0.95)' : 'scale(1)',
            transition: 'all 0.3s ease'
          }}
        >
          <button
            onClick={handleSkip}
            style={{
              ...buttonStyles,
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              color: '#000000',
              padding: '12px 24px',
              borderRadius: '8px',
              border: '1px solid rgba(209, 213, 219, 0.8)',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              backdropFilter: 'blur(4px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 1)';
              e.currentTarget.style.borderColor = 'rgba(156, 163, 175, 0.8)';
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
              e.currentTarget.style.borderColor = 'rgba(209, 213, 219, 0.8)';
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.95)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
          >
            <svg 
              width="20" 
              height="20" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              style={{ flexShrink: 0 }}
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                d="M13 5l7 7-7 7M5 5l7 7-7 7" 
              />
            </svg>
            Saltar Intro
          </button>
        </div>
      );
      return createPortal(fullscreenButtonElement, videoContainer);
    }
  }

  // En modo normal, renderizar directamente
  return buttonElement;
};

export default SkipIntroButton;