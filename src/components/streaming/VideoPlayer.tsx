'use client';

import React, { useRef, useState, useEffect } from 'react';
import 'video.js/dist/video-js.css';
import '@/styles/videojs-custom.css';
import { useASSRenderer } from '@/hooks/useASSRenderer';
import { logger } from '@/lib/logger';

interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  className?: string;
}

export default function VideoPlayer({ videoRef, className = '' }: VideoPlayerProps) {
  const assContainerRef = useRef<HTMLDivElement>(null);
  const [assContent, setAssContent] = useState<string | null>(null);
  const [assEnabled, setAssEnabled] = useState(false);
  const manualASSActiveRef = useRef(false); // Track si hay un ASS manual activo

  // Escuchar eventos de subtítulos ASS (carga manual)
  useEffect(() => {
    const handleASSSubtitle = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { content, label } = customEvent.detail;
      
      logger.log('🎨 [VideoPlayer] Subtítulo ASS recibido (manual):', label);
      
      // Solo activar si realmente hay contenido ASS
      if (content && content.length > 0) {
        setAssContent(content);
        setAssEnabled(true);
        manualASSActiveRef.current = true; // Marcar que hay un ASS manual
      }
    };

    const handleASSDeactivate = () => {
      logger.log('📝 [VideoPlayer] Desactivando ASS por selección de VTT');
      setAssEnabled(false);
      setAssContent(null);
      manualASSActiveRef.current = false;
    };

    window.addEventListener('ass-subtitle-available', handleASSSubtitle);
    window.addEventListener('ass-subtitle-deactivate', handleASSDeactivate);

    return () => {
      window.removeEventListener('ass-subtitle-available', handleASSSubtitle);
      window.removeEventListener('ass-subtitle-deactivate', handleASSDeactivate);
    };
  }, []);

  // 🎨 Escuchar cambios en los text tracks para detectar cuando se selecciona un ASS
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    let cleanup: (() => void) | null = null;
    
    // Esperar un tick para que Video.js se inicialice
    const timeoutId = setTimeout(() => {
      const player = (window as any).videojs?.(video);
      if (!player) {
        logger.warn('⚠️ [VideoPlayer] No se pudo obtener el player de Video.js');
        return;
      }

      const textTracks = player.textTracks();
      if (!textTracks) {
        logger.warn('⚠️ [VideoPlayer] textTracks no disponible en el player');
        return;
      }

      logger.log('✅ [VideoPlayer] Player y textTracks disponibles, configurando listener');

      const handleTrackChange = () => {
        logger.log('🔍 [VideoPlayer] Track change detectado');
        
        const tracksArray: any[] = [];
        for (let i = 0; i < textTracks.length; i++) {
          tracksArray.push(textTracks[i]);
        }
        
        // Debug: Loggear TODOS los tracks
        logger.log(`🔍 [VideoPlayer] Total tracks: ${tracksArray.length}`);
        for (let i = 0; i < tracksArray.length; i++) {
          const track = tracksArray[i];
          logger.log(`🔍 [VideoPlayer] Track ${i}: ${track.label} (mode=${track.mode}, kind=${track.kind}, isASS=${(track as any).isASS})`);
        }
        
        // Buscar track activo
        let activeASSTrack: any = null;
        let hasActiveNonASSTrack = false;
        let hasAnyActiveTrack = false;
        
        for (const track of tracksArray) {
          if (track.mode === 'showing') {
            hasAnyActiveTrack = true;
            const isASS = (track as any).isASS === true;
            
            logger.log(`🎯 [VideoPlayer] Track activo encontrado: ${track.label} (isASS=${isASS})`);
            
            if (isASS) {
              activeASSTrack = track;
              logger.log(`🎨 [VideoPlayer] Track ASS activo detectado: ${track.label}`);
            } else {
              hasActiveNonASSTrack = true;
              logger.log(`📝 [VideoPlayer] Track VTT activo: ${track.label}`);
            }
          }
        }
        
        // Si hay un track ASS activo (desde StreamingPlayer), activar assjs
        if (activeASSTrack) {
          const content = (activeASSTrack as any).assContent;
          logger.log(`🔍 [VideoPlayer] ASS Content disponible: ${!!content} (length=${content?.length || 0})`);
          if (content) {
            logger.log('✅ [VideoPlayer] Activando ASS renderer (desde track)');
            setAssContent(content);
            setAssEnabled(true);
            manualASSActiveRef.current = false; // No es manual, es desde track
            
            // ⚠️ NO desactivar el track para que aparezca como seleccionado en el menú
            // activeASSTrack.mode = 'disabled'; // ← COMENTADO
            // Video.js no puede parsear ASS de todas formas, así que dejarlo como 'showing' es seguro
            
            // CRÍTICO: Si hay VTT activos también, desactivarlos porque el ASS tiene prioridad
            if (hasActiveNonASSTrack) {
              logger.log('🔒 [VideoPlayer] Desactivando tracks VTT porque ASS tiene prioridad');
              for (const track of tracksArray) {
                if (track.mode === 'showing' && !(track as any).isASS) {
                  track.mode = 'disabled';
                  logger.log(`🔒 [VideoPlayer] Desactivado: ${track.label}`);
                }
              }
            }
          } else {
            logger.warn('⚠️ [VideoPlayer] Track ASS sin contenido!');
          }
        } else if (hasActiveNonASSTrack) {
          // Si hay un track VTT activo (y NO hay ASS), desactivar ASS
          if (assEnabled && !manualASSActiveRef.current) {
            logger.log('❌ [VideoPlayer] Desactivando ASS renderer (track VTT activo)');
            setAssEnabled(false);
            setAssContent(null);
          }
        } else if (!hasAnyActiveTrack) {
          // Si NO hay ningún track activo (usuario seleccionó "Off"), desactivar ASS
          if (assEnabled && !manualASSActiveRef.current) {
            logger.log('❌ [VideoPlayer] Desactivando ASS renderer (usuario seleccionó Off)');
            setAssEnabled(false);
            setAssContent(null);
          }
        }
        // Si no hay ningún track activo pero hay un ASS manual, mantenerlo activo
      };

      textTracks.addEventListener('change', handleTrackChange);
      
      // Check inicial
      handleTrackChange();
      
      cleanup = () => {
        textTracks.removeEventListener('change', handleTrackChange);
      };
    }, 100); // Esperar 100ms para que Video.js se inicialice

    return () => {
      clearTimeout(timeoutId);
      if (cleanup) cleanup();
    };
  }, [videoRef, assEnabled]);

  // Usar el hook de ASS renderer
  useASSRenderer({
    videoElement: videoRef.current,
    containerElement: assContainerRef.current,
    assContent,
    enabled: assEnabled,
  });

  return (
    <div className={`w-full h-full relative ${className}`}>
      <div data-vjs-player className="w-full h-full relative">
        <video
          ref={videoRef}
          className="video-js vjs-big-play-centered vjs-theme-forest w-full h-full"
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        {/* Contenedor para renderizado de subtítulos ASS - debe estar DENTRO de data-vjs-player para fullscreen */}
        {/* SIEMPRE renderizar el contenedor, solo cambiar visibility */}
        <div
          ref={assContainerRef}
          className="vjs-ass-subtitle-container"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 100, // Por encima del video pero debajo de controles
            overflow: 'hidden',
            visibility: assEnabled ? 'visible' : 'hidden',
          }}
        />
      </div>
    </div>
  );
}

