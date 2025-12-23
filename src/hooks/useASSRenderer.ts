'use client';

import { useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';

interface ASSRendererOptions {
  videoElement: HTMLVideoElement | null;
  containerElement: HTMLDivElement | null;
  assContent: string | null;
  enabled: boolean;
}

/**
 * Hook simple para renderizar subtítulos ASS/SSA usando assjs
 */
export function useASSRenderer({
  videoElement,
  containerElement,
  assContent,
  enabled,
}: ASSRendererOptions) {
  const assInstanceRef = useRef<any>(null);

  useEffect(() => {
    logger.log(`🔍 [ASS] useEffect triggered - enabled: ${enabled}, hasVideo: ${!!videoElement}, hasContainer: ${!!containerElement}, hasContent: ${!!assContent}`);
    
    // Si no está habilitado o faltan elementos, limpiar
    if (!enabled || !videoElement || !containerElement || !assContent) {
      if (assInstanceRef.current) {
        logger.log('🧹 [ASS] Limpiando instancia ASS');
        try {
          // Ejecutar cleanup de listeners si existe
          if ((assInstanceRef.current as any).__cleanup) {
            (assInstanceRef.current as any).__cleanup();
          }
          assInstanceRef.current.destroy();
        } catch (err) {
          logger.error('❌ [ASS] Error al destruir:', err);
        }
        assInstanceRef.current = null;
      }
      return;
    }

    let mounted = true;

    const initASS = async () => {
      try {
        logger.log('🎨 [ASS] Inicializando renderizador ASS...');

        // Cargar módulo ASS dinámicamente
        const ASSModule = await import('assjs');
        
        if (!mounted) return;

        // Limpiar instancia anterior si existe
        if (assInstanceRef.current) {
          try {
            // Ejecutar cleanup de listeners si existe
            if ((assInstanceRef.current as any).__cleanup) {
              (assInstanceRef.current as any).__cleanup();
            }
            assInstanceRef.current.destroy();
          } catch (err) {
            logger.warn('⚠️ [ASS] Error limpiando instancia anterior:', err);
          }
          assInstanceRef.current = null;
        }

        // Crear nueva instancia
        const ass = new ASSModule.default(assContent, videoElement, {
          container: containerElement,
          resampling: 'video_height',
        });

        assInstanceRef.current = ass;
        logger.log('✅ [ASS] Renderizador inicializado correctamente');
        
        // 🔄 Forzar sincronización con pause/play instantáneo
        const forceSyncWithPausePlay = async () => {
          const wasPlaying = !videoElement.paused;
          const currentTime = videoElement.currentTime;
          
          try {
            logger.log('🔄 [ASS] Forzando sincronización con pause/play instantáneo');
            
            if (wasPlaying) {
              videoElement.pause();
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            // Forzar resize
            if (typeof ass.resize === 'function') {
              ass.resize();
            }
            
            // Si estaba reproduciendo, volver a reproducir
            if (wasPlaying) {
              await new Promise(resolve => setTimeout(resolve, 50));
              videoElement.play().catch(err => {
                logger.warn('⚠️ [ASS] Error al reanudar reproducción:', err);
              });
            }
            
            logger.log('✅ [ASS] Sincronización forzada completada');
          } catch (err) {
            logger.error('❌ [ASS] Error en sincronización forzada:', err);
          }
        };
        
        // Aplicar sincronización inicial
        setTimeout(forceSyncWithPausePlay, 100);
        
        // Escuchar eventos de seeked para mantener sincronización
        const handleSeeked = () => {
          logger.log('🔄 [ASS] Seek detectado, forzando resize');
          if (ass && typeof ass.resize === 'function') {
            ass.resize();
          }
        };
        
        videoElement.addEventListener('seeked', handleSeeked);
        
        // Cleanup de listeners
        const cleanup = () => {
          videoElement.removeEventListener('seeked', handleSeeked);
        };
        
        // Guardar cleanup para usar en destroy
        (ass as any).__cleanup = cleanup;
      } catch (err) {
        logger.error('❌ [ASS] Error inicializando:', err);
      }
    };

    initASS();

    return () => {
      mounted = false;
      if (assInstanceRef.current) {
        logger.log('🧹 [ASS] Cleanup en unmount');
        try {
          // Ejecutar cleanup de listeners si existe
          if ((assInstanceRef.current as any).__cleanup) {
            (assInstanceRef.current as any).__cleanup();
          }
          assInstanceRef.current.destroy();
        } catch (err) {
          logger.error('❌ [ASS] Error en cleanup:', err);
        }
        assInstanceRef.current = null;
      }
    };
  }, [enabled, videoElement, containerElement, assContent]);

  return {
    instance: assInstanceRef.current,
  };
}

