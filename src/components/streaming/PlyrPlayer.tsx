'use client';

import React, { useEffect, useRef } from 'react';
import 'plyr/dist/plyr.css';
import '@/styles/plyr-custom.css';

interface PlyrPlayerProps {
  src: string;
  type?: 'video/mp4' | 'application/x-mpegURL';
  poster?: string;
  onReady?: (player: any) => void;
  onTimeUpdate?: (time: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  subtitles?: Array<{
    src: string;
    label: string;
    srclang: string;
    default?: boolean;
  }>;
  title?: string;
}

export default function PlyrPlayer({
  src,
  type = 'video/mp4',
  poster,
  onReady,
  onTimeUpdate,
  onPlay,
  onPause,
  subtitles = [],
  title = ''
}: PlyrPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const [isClient, setIsClient] = React.useState(false);

  // Asegurar que solo se ejecute en el cliente
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !videoRef.current || !src) return;

    // Importar Plyr y HLS dinámicamente solo en el cliente
    Promise.all([
      import('plyr'),
      import('hls.js')
    ]).then(([PlyrModule, HlsModule]) => {
      const Plyr = PlyrModule.default;
      const Hls = HlsModule.default;

      // Si es HLS y el navegador lo soporta, usar hls.js
      if (type === 'application/x-mpegURL' && Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 600,
          enableWorker: true,
        });
        hls.loadSource(src);
        hls.attachMedia(videoRef.current!);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('✅ [HLS] Manifest parsed, ready to play');
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('❌ [HLS] Error:', data);
        });
      } else if (videoRef.current!.canPlayType(type)) {
        // Si el navegador soporta el tipo nativamente (Safari con HLS, o MP4)
        videoRef.current!.src = src;
      } else {
        console.error('❌ [PLYR] Format not supported:', type);
      }
      
      if (poster && videoRef.current) {
        videoRef.current.poster = poster;
      }

      // Configuración de Plyr
      const player = new Plyr(videoRef.current!, {
        controls: [
          'play-large',
          'play',
          'rewind',
          'fast-forward',
          'progress',
          'current-time',
          'duration',
          'mute',
          'volume',
          'captions',
          'settings',
          'pip',
          'airplay',
          'fullscreen'
        ],
        settings: ['captions', 'quality', 'speed'],
        fullscreen: { enabled: true, fallback: true, iosNative: true },
        captions: { active: true, language: 'auto', update: true },
        keyboard: { focused: true, global: true },
        tooltips: { controls: true, seek: true },
        speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
        invertTime: false,
        hideControls: false, // NUNCA ocultar controles
        i18n: {
          restart: 'Reiniciar',
          rewind: 'Retroceder {seektime}s',
          play: 'Reproducir',
          pause: 'Pausar',
          fastForward: 'Adelantar {seektime}s',
          seek: 'Buscar',
          seekLabel: '{currentTime} de {duration}',
          played: 'Reproducido',
          buffered: 'Cargado',
          currentTime: 'Tiempo actual',
          duration: 'Duración',
          volume: 'Volumen',
          mute: 'Silenciar',
          unmute: 'Activar sonido',
          enableCaptions: 'Activar subtítulos',
          disableCaptions: 'Desactivar subtítulos',
          enterFullscreen: 'Pantalla completa',
          exitFullscreen: 'Salir de pantalla completa',
          settings: 'Ajustes',
          speed: 'Velocidad',
          quality: 'Calidad',
          normal: 'Normal',
        },
        seekTime: 10,
        storage: { enabled: true, key: 'plyr' }
      });

      playerRef.current = player;

      // Event listeners
      player.on('ready', () => {
        console.log('✅ [PLYR] Player ready', { src, type });
        
        // REORGANIZAR CONTROLES EN 2 FILAS
        const controlsEl = player.elements.container?.querySelector('.plyr__controls');
        if (controlsEl) {
          // Crear contenedor para controles de la fila 2
          const row2Container = document.createElement('div');
          row2Container.className = 'plyr-row2-container';
          row2Container.style.cssText = `
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            width: 100% !important;
            gap: 8px !important;
          `;
          
          // Grupo izquierdo
          const leftGroup = document.createElement('div');
          leftGroup.className = 'plyr-left-group';
          leftGroup.style.cssText = `
            display: flex !important;
            align-items: center !important;
            gap: 4px !important;
          `;
          
          // Grupo centro (título)
          const centerGroup = document.createElement('div');
          centerGroup.className = 'plyr-center-group';
          centerGroup.style.cssText = `
            flex: 1 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            min-width: 100px !important;
          `;
          
          // Grupo derecho
          const rightGroup = document.createElement('div');
          rightGroup.className = 'plyr-right-group';
          rightGroup.style.cssText = `
            display: flex !important;
            align-items: center !important;
            gap: 4px !important;
          `;
          
          // Mover botones al grupo izquierdo
          const play = controlsEl.querySelector('[data-plyr="play"]');
          const rewind = controlsEl.querySelector('[data-plyr="rewind"]');
          const forward = controlsEl.querySelector('[data-plyr="fast-forward"]');
          const volume = controlsEl.querySelector('.plyr__volume');
          
          if (play) leftGroup.appendChild(play);
          if (rewind) leftGroup.appendChild(rewind);
          if (forward) leftGroup.appendChild(forward);
          if (volume) leftGroup.appendChild(volume);
          
          // Agregar título al centro
          if (title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'plyr-title-display';
            titleEl.textContent = title;
            titleEl.style.cssText = `
              color: #fff !important;
              font-size: 15px !important;
              font-weight: 600 !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              max-width: 100% !important;
            `;
            centerGroup.appendChild(titleEl);
          }
          
          // Mover botones al grupo derecho
          const captions = controlsEl.querySelector('[data-plyr="captions"]');
          const settings = controlsEl.querySelector('[data-plyr="settings"]');
          const pip = controlsEl.querySelector('[data-plyr="pip"]');
          const airplay = controlsEl.querySelector('[data-plyr="airplay"]');
          const fullscreen = controlsEl.querySelector('[data-plyr="fullscreen"]');
          const menu = controlsEl.querySelector('.plyr__menu');
          
          if (captions) rightGroup.appendChild(captions);
          if (menu) rightGroup.appendChild(menu);
          if (settings) rightGroup.appendChild(settings);
          if (pip) rightGroup.appendChild(pip);
          if (airplay) rightGroup.appendChild(airplay);
          if (fullscreen) rightGroup.appendChild(fullscreen);
          
          // Ensamblar fila 2
          row2Container.appendChild(leftGroup);
          row2Container.appendChild(centerGroup);
          row2Container.appendChild(rightGroup);
          
          // Agregar al final del control bar
          controlsEl.appendChild(row2Container);
          
          console.log('✅ [PLYR] Controls reorganized into 2 rows');
        }
        
        if (onReady) onReady(player);
      });

      player.on('loadeddata', () => {
        console.log('✅ [PLYR] Video loaded');
      });

      player.on('canplay', () => {
        console.log('✅ [PLYR] Can play');
      });

      player.on('timeupdate', () => {
        if (onTimeUpdate) onTimeUpdate(player.currentTime);
      });

      player.on('play', () => {
        console.log('▶️ [PLYR] Playing');
        if (onPlay) onPlay();
      });

      player.on('pause', () => {
        console.log('⏸️ [PLYR] Paused');
        if (onPause) onPause();
      });

      player.on('error', (event: any) => {
        console.error('❌ [PLYR] Error:', event);
      });
    }).catch((error) => {
      console.error('❌ [PLYR] Error loading Plyr:', error);
    });

    // Cleanup
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.error('Error destroying player:', e);
        }
      }
    };
  }, [isClient, src, type, poster, title]);

  if (!isClient) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <div className="text-white">Cargando reproductor...</div>
      </div>
    );
  }

  if (!src) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <div className="text-white">No hay fuente de video disponible</div>
      </div>
    );
  }

  return (
    <div className="plyr-container" style={{ width: '100%', height: '100%' }}>
      <video
        ref={videoRef}
        className="plyr-react plyr"
        playsInline
        crossOrigin="anonymous"
        style={{ width: '100%', height: '100%' }}
      >
        {/* Source se establece via JS para mejor compatibilidad con HLS */}
      </video>
    </div>
  );
}
