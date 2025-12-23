'use client';

import { logger } from '@/lib/logger';
import { useState, useRef, useEffect } from 'react';
import { PlayIcon, PauseIcon, StopIcon } from '@heroicons/react/24/solid';

// Definir tipos para WebTorrent
declare global {
  interface Window {
    WebTorrent: any;
  }
}

export default function TorrentStreamTest() {
  const [client, setClient] = useState<any>(null);
  const [torrent, setTorrent] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [customMagnetLink, setCustomMagnetLink] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);

  // Magnet link de prueba (película de dominio público)
  const testMagnetLink = "magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com";

  // Inicializar WebTorrent usando CDN
  useEffect(() => {
    const initWebTorrent = async () => {
      try {
        // Verificar si estamos en el navegador
        if (typeof window === 'undefined') {
          setError('WebTorrent solo funciona en el navegador');
          return;
        }

        // Cargar WebTorrent desde CDN
        if (!window.WebTorrent) {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js';
          script.onload = () => {
            logger.log('WebTorrent cargado desde CDN');
            initializeClient();
          };
          script.onerror = () => {
            setError('Error al cargar WebTorrent desde CDN');
          };
          document.head.appendChild(script);
        } else {
          initializeClient();
        }

        function initializeClient() {
          try {
            const newClient = new window.WebTorrent({
              // Configuración optimizada para máxima velocidad
              maxConns: 200,        // Aumentado de default para más conexiones
              downloadLimit: -1,    // Sin límite de descarga
              uploadLimit: 5120,    // 5MB/s upload para mejores peers
              tracker: {
                iceServers: [
                  { urls: 'stun:stun.l.google.com:19302' },
                  { urls: 'stun:global.stun.twilio.com:3478' },
                  { urls: 'stun:stun1.l.google.com:19302' },
                  { urls: 'stun:stun2.l.google.com:19302' },
                  { urls: 'stun:stun3.l.google.com:19302' },
                  { urls: 'stun:stun4.l.google.com:19302' }
                ],
                maxPeers: 100,      // Más peers para mejor velocidad
                getAnnounceOpts: () => ({
                  numwant: 80,      // Solicitar más peers
                  compact: 1
                })
              },
              dht: {
                maxPeers: 100       // Más peers en DHT
              },
              // Configuraciones adicionales para mejorar conectividad
              lsd: true,
              natUpnp: true,
              natPmp: true,
              // Timeout optimizado para streaming
              torrentPort: 6881,
              pieceTimeout: 15000,  // 15s timeout
              requestTimeout: 8000  // 8s timeout
            });
            
            // Manejar errores del cliente
            newClient.on('error', (err: any) => {
              logger.error('Error del cliente WebTorrent:', err);
              setError(`Error del cliente: ${err.message}`);
            });

            // Log cuando el cliente está listo
            newClient.on('ready', () => {
              logger.log('✅ Cliente WebTorrent listo');
            });

            setClient(newClient);
            logger.log('WebTorrent inicializado correctamente');
          } catch (err: any) {
            logger.error('Error creando cliente WebTorrent:', err);
            setError(`Error creando cliente: ${err.message}`);
          }
        }
        
      } catch (err: any) {
        logger.error('Error inicializando WebTorrent:', err);
        setError(`Error al cargar WebTorrent: ${err.message}`);
      }
    };

    initWebTorrent();

    // Cleanup al desmontar
    return () => {
      if (client) {
        client.destroy();
      }
    };
  }, []);

  const startStreaming = (magnetLink?: string) => {
    if (!client) {
      setError('WebTorrent no está inicializado');
      return;
    }

    const linkToUse = magnetLink || customMagnetLink || testMagnetLink;
    
    if (!linkToUse.startsWith('magnet:')) {
      setError('Por favor ingresa un magnet link válido');
      return;
    }

    setIsLoading(true);
    setError('');
    setProgress(0);

    logger.log('Iniciando descarga del torrent...');
    logger.log('Magnet link:', linkToUse);

    // Agregar el torrent con eventos más detallados
    const newTorrent = client.add(linkToUse, {
      // Configuraciones específicas para el torrent
      announce: [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://9.rarbg.me:2970/announce',
        'udp://tracker.openbittorrent.com:6969/announce',
        'udp://tracker.coppersurfer.tk:6969/announce',
        'udp://glotorrents.pw:6969/announce',
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://torrent.gresille.org:80/announce',
        'udp://p4p.arenabg.com:1337/announce',
        'udp://tracker.leechers-paradise.org:6969/announce'
      ]
    });

    // Evento cuando el torrent está listo
    newTorrent.on('ready', () => {
      logger.log('✅ Torrent listo:', newTorrent.name);
      logger.log('📁 Archivos encontrados:', newTorrent.files.map((f: any) => f.name));
      logger.log('📊 Tamaño total:', (newTorrent.length / 1024 / 1024).toFixed(2), 'MB');
      
      // Buscar el archivo de video más grande (incluyendo más formatos)
      const videoFile = newTorrent.files.find((file: any) => {
        const name = file.name.toLowerCase();
        return name.endsWith('.mp4') || 
               name.endsWith('.mkv') || 
               name.endsWith('.avi') ||
               name.endsWith('.webm') ||
               name.endsWith('.mov') ||
               name.endsWith('.m4v');
      });

      if (!videoFile) {
        logger.error('❌ No se encontró archivo de video');
        setError('No se encontró archivo de video en el torrent');
        setIsLoading(false);
        return;
      }

      logger.log('🎬 Archivo de video seleccionado:', videoFile.name);
      logger.log('📏 Tamaño del video:', (videoFile.length / 1024 / 1024).toFixed(2), 'MB');

      // Para archivos MKV, necesitamos usar un enfoque diferente
      if (videoFile.name.toLowerCase().endsWith('.mkv')) {
        logger.log('🎭 Detectado archivo MKV, usando stream directo...');
        
        // Crear URL del blob para streaming
        videoFile.getBlobURL((err: any, url: string) => {
          if (err) {
            logger.error('❌ Error obteniendo blob URL:', err);
            setError('Error procesando archivo MKV');
            setIsLoading(false);
            return;
          }

          if (videoRef.current) {
            videoRef.current.src = url;
            videoRef.current.load();
            setIsLoading(false);
            logger.log('✅ Video MKV listo para reproducir');
          }
        });
      } else {
        // Para MP4 y otros formatos compatibles
        logger.log('🎥 Procesando archivo de video estándar...');
        if (videoRef.current) {
          videoFile.renderTo(videoRef.current, {
            autoplay: false,
            controls: true
          });
          
          setIsLoading(false);
          logger.log('✅ Video listo para reproducir');
        }
      }
    });

    // Evento de metadata (información básica del torrent)
    newTorrent.on('metadata', () => {
      logger.log('📋 Metadata recibida para:', newTorrent.name);
      logger.log('🔢 Número de archivos:', newTorrent.files.length);
    });

    // Escuchar eventos de progreso
    newTorrent.on('download', () => {
      const progressPercent = Math.round(newTorrent.progress * 100);
      setProgress(progressPercent);
      if (progressPercent % 10 === 0) { // Log cada 10%
        logger.log(`📥 Progreso: ${progressPercent}%`);
      }
    });

    // Evento cuando se conecta a peers
    newTorrent.on('wire', (wire: any) => {
      logger.log('🔗 Conectado a peer:', wire.remoteAddress);
    });

    // Evento cuando no hay peers
    newTorrent.on('noPeers', () => {
      logger.warn('⚠️ No se encontraron peers para este torrent');
      setError('No se encontraron peers. El torrent puede estar inactivo.');
    });

    // Manejar errores del torrent
    newTorrent.on('error', (err: any) => {
      logger.error('❌ Error del torrent:', err);
      setError(`Error: ${err.message}`);
      setIsLoading(false);
    });

    logger.log('🚀 Torrent agregado al cliente, buscando peers...');

    // Agregar timeout para detectar si no se encuentran peers
    const peerTimeout = setTimeout(() => {
      if (newTorrent.numPeers === 0) {
        logger.warn('⏰ Timeout: No se encontraron peers después de 30 segundos');
        setError('No se pudieron encontrar peers para este torrent. Puede estar inactivo o tener pocos seeders.');
      }
    }, 30000); // 30 segundos

    // Limpiar timeout si se encuentran peers
    newTorrent.on('wire', () => {
      clearTimeout(peerTimeout);
    });

    setTorrent(newTorrent);
  };

  const stopStreaming = () => {
    if (torrent) {
      torrent.destroy();
      setTorrent(null);
      setProgress(0);
      setIsPlaying(false);
      if (videoRef.current) {
        videoRef.current.src = '';
      }
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-900 text-white rounded-lg">
      <h2 className="text-2xl font-bold mb-6">Prueba de Streaming de Torrents</h2>
      
      {/* Campo para magnet link personalizado */}
      <div className="mb-6 p-4 bg-gray-800 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Magnet Link Personalizado</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={customMagnetLink}
            onChange={(e) => setCustomMagnetLink(e.target.value)}
            placeholder="Pega tu magnet link aquí (magnet:?xt=urn:btih:...)"
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500"
          />
          <button
            onClick={() => startStreaming()}
            disabled={isLoading || !!torrent || !customMagnetLink}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            Probar Link
          </button>
        </div>
        <p className="text-gray-400 text-sm mt-2">
          Pega un magnet link de cualquier torrent para probarlo. Funciona mejor con archivos MP4, pero también soporta MKV, AVI, WebM, etc.
        </p>
      </div>

      {/* Información del test por defecto */}
      <div className="mb-6 p-4 bg-gray-800 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Película de Prueba por Defecto</h3>
        <p className="text-gray-300 text-sm mb-2">
          <strong>Título:</strong> Big Buck Bunny (Dominio Público)
        </p>
        <p className="text-gray-300 text-sm mb-3">
          <strong>Descripción:</strong> Película de animación corta de código abierto, perfecta para pruebas.
        </p>
        <button
          onClick={() => startStreaming(testMagnetLink)}
          disabled={isLoading || !!torrent}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded-lg transition-colors"
        >
          Usar Película de Prueba
        </button>
      </div>

      {/* Controles de reproducción */}
      {torrent && (
        <div className="flex gap-4 mb-6">
          <button
            onClick={togglePlay}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
          >
            {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
            {isPlaying ? 'Pausar' : 'Reproducir'}
          </button>

          <button
            onClick={stopStreaming}
            className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors"
          >
            <StopIcon className="w-5 h-5" />
            Detener Stream
          </button>
        </div>
      )}

      {/* Barra de progreso */}
      {torrent && (
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span>Descarga: {progress}%</span>
            <span>Peers: {torrent.numPeers || 0}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-red-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Mensajes de error */}
      {error && (
        <div className="mb-6 p-4 bg-red-900 border border-red-700 rounded-lg">
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* Reproductor de video */}
      <div className="bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-auto"
          controls
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        >
          Tu navegador no soporta el elemento video.
        </video>
      </div>

      {/* Información técnica */}
      {torrent && (
        <div className="mt-6 p-4 bg-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Información Técnica</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Nombre:</span>
              <p className="text-white">{torrent.name}</p>
            </div>
            <div>
              <span className="text-gray-400">Tamaño:</span>
              <p className="text-white">{Math.round(torrent.length / 1024 / 1024)} MB</p>
            </div>
            <div>
              <span className="text-gray-400">Velocidad de descarga:</span>
              <p className="text-white">{Math.round(torrent.downloadSpeed / 1024)} KB/s</p>
            </div>
            <div>
              <span className="text-gray-400">Archivos:</span>
              <p className="text-white">{torrent.files?.length || 0}</p>
            </div>
          </div>
        </div>
      )}

      {/* Instrucciones */}
      <div className="mt-6 p-4 bg-blue-900 border border-blue-700 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Instrucciones</h3>
        <ol className="list-decimal list-inside text-sm text-blue-200 space-y-1">
          <li>Haz clic en "Iniciar Stream" para comenzar la descarga del torrent</li>
          <li>Espera a que se descargue suficiente contenido (generalmente 5-10%)</li>
          <li>El video aparecerá automáticamente cuando esté listo</li>
          <li>Usa los controles para reproducir/pausar</li>
          <li>Haz clic en "Detener" para limpiar y parar la descarga</li>
        </ol>
      </div>
    </div>
  );
}