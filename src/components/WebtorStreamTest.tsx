'use client';

import { logger } from '@/lib/logger';
import { useState, useRef } from 'react';

interface WebtorStreamTestProps {}

export default function WebtorStreamTest({}: WebtorStreamTestProps) {
  const [magnetLink, setMagnetLink] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [torrentInfo, setTorrentInfo] = useState<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Magnet link de prueba (mismo que usaste antes)
  const testMagnetLink = 'magnet:?xt=urn:btih:65ef208ed747e55478a0f1ef46f7b7e80a35f162&dn=Peacemaker.2022.S02E06.Ignorance.Is.Chris.480p.x264-mSD.mkv&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2F9.rarbg.me%3A2970%2Fannounce&tr=udp%3A%2F%2Fp4p.arenabg.com%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce&tr=udp%3A%2F%2Ftracker.dler.org%3A6969%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Fipv4.tracker.harry.lu%3A80%2Fannounce&tr=https%3A%2F%2Fopentracker.i2p.rocks%3A443%2Fannounce';

  const startStreaming = async (linkToUse?: string) => {
    const finalLink = linkToUse || magnetLink || testMagnetLink;
    
    if (!finalLink) {
      setError('Por favor ingresa un magnet link');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStreamUrl(null);
    setTorrentInfo(null);

    try {
      logger.log('🚀 Iniciando streaming con Webtor.io...');
      logger.log('📎 Magnet link:', finalLink);

      // Webtor.io API - obtener información del torrent
      const webtorUrl = `https://webtor.io/api/torrent/info?magnet=${encodeURIComponent(finalLink)}`;
      
      logger.log('📡 Consultando API de Webtor.io...');
      const response = await fetch(webtorUrl);
      
      if (!response.ok) {
        throw new Error(`Error de API: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      logger.log('📋 Información del torrent recibida:', data);
      
      setTorrentInfo(data);

      // Buscar archivos de video
      const videoFiles = data.files?.filter((file: any) => {
        const name = file.name.toLowerCase();
        return name.endsWith('.mp4') || 
               name.endsWith('.mkv') || 
               name.endsWith('.avi') ||
               name.endsWith('.webm') ||
               name.endsWith('.mov') ||
               name.endsWith('.m4v');
      }) || [];

      if (videoFiles.length === 0) {
        throw new Error('No se encontraron archivos de video en el torrent');
      }

      // Seleccionar el archivo de video más grande
      const selectedVideo = videoFiles.reduce((largest: any, current: any) => 
        current.size > largest.size ? current : largest
      );

      logger.log('🎬 Archivo de video seleccionado:', selectedVideo.name);
      logger.log('📏 Tamaño:', (selectedVideo.size / 1024 / 1024).toFixed(2), 'MB');

      // Construir URL de streaming de Webtor.io
      const streamingUrl = `https://webtor.io/api/torrent/stream?magnet=${encodeURIComponent(finalLink)}&file=${encodeURIComponent(selectedVideo.path)}`;
      
      logger.log('🎥 URL de streaming generada:', streamingUrl);
      setStreamUrl(streamingUrl);

      // Configurar el video player
      if (videoRef.current) {
        videoRef.current.src = streamingUrl;
        videoRef.current.load();
      }

      setIsLoading(false);
      logger.log('✅ Streaming listo!');

    } catch (err: any) {
      logger.error('❌ Error:', err);
      setError(`Error: ${err.message}`);
      setIsLoading(false);
    }
  };

  const stopStreaming = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
    }
    setStreamUrl(null);
    setTorrentInfo(null);
    setError(null);
    logger.log('⏹️ Streaming detenido');
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">
          🌐 Webtor.io Streaming Test
        </h1>
        
        <div className="space-y-4">
          <p className="text-gray-600">
            Prueba de streaming usando <strong>Webtor.io</strong> - funciona con torrents tradicionales!
          </p>

          {/* Test rápido con Peacemaker */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold text-blue-800 mb-2">🧪 Prueba Rápida</h3>
            <p className="text-sm text-blue-600 mb-3">
              Probar con el episodio de Peacemaker que no funcionaba con WebTorrent:
            </p>
            <button
              onClick={() => startStreaming(testMagnetLink)}
              disabled={isLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '⏳ Cargando...' : '🚀 Probar Peacemaker S02E06'}
            </button>
          </div>

          {/* Input personalizado */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-2">🔗 Magnet Link Personalizado</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={magnetLink}
                onChange={(e) => setMagnetLink(e.target.value)}
                placeholder="Pega tu magnet link aquí..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <button
                onClick={() => startStreaming()}
                disabled={isLoading || !magnetLink}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '⏳' : '▶️'} Stream
              </button>
            </div>
          </div>

          {/* Controles */}
          {streamUrl && (
            <div className="flex gap-2">
              <button
                onClick={stopStreaming}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                ⏹️ Detener
              </button>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">❌ {error}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800">⏳ Conectando con Webtor.io...</p>
          </div>
        )}

        {/* Información del torrent */}
        {torrentInfo && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="font-semibold text-green-800 mb-2">📋 Información del Torrent</h3>
            <div className="text-sm text-green-700 space-y-1">
              <p><strong>Nombre:</strong> {torrentInfo.name}</p>
              <p><strong>Tamaño total:</strong> {(torrentInfo.size / 1024 / 1024).toFixed(2)} MB</p>
              <p><strong>Archivos:</strong> {torrentInfo.files?.length || 0}</p>
              {torrentInfo.files && (
                <div className="mt-2">
                  <p><strong>Archivos de video encontrados:</strong></p>
                  <ul className="list-disc list-inside ml-2">
                    {torrentInfo.files
                      .filter((file: any) => {
                        const name = file.name.toLowerCase();
                        return name.endsWith('.mp4') || name.endsWith('.mkv') || 
                               name.endsWith('.avi') || name.endsWith('.webm') ||
                               name.endsWith('.mov') || name.endsWith('.m4v');
                      })
                      .map((file: any, index: number) => (
                        <li key={index} className="text-xs">
                          {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                        </li>
                      ))
                    }
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Video Player */}
        {streamUrl && (
          <div className="mt-6">
            <h3 className="font-semibold text-gray-800 mb-3">🎬 Video Player</h3>
            <div className="bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                controls
                className="w-full h-auto"
                style={{ maxHeight: '500px' }}
              >
                Tu navegador no soporta el elemento video.
              </video>
            </div>
            
            {streamUrl && (
              <div className="mt-2 p-2 bg-gray-100 rounded text-xs text-gray-600">
                <strong>Stream URL:</strong> {streamUrl}
              </div>
            )}
          </div>
        )}

        {/* Información técnica */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold text-gray-800 mb-2">ℹ️ Cómo funciona Webtor.io</h3>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li><strong>Conecta con torrents tradicionales</strong> - No solo WebTorrent peers</li>
            <li><strong>Streaming instantáneo</strong> - No necesitas descargar el archivo completo</li>
            <li><strong>Anónimo</strong> - Tu IP no se expone al swarm BitTorrent</li>
            <li><strong>Compatible con MKV</strong> - Funciona con todos los formatos de video</li>
            <li><strong>Sin instalaciones</strong> - Funciona directamente en el navegador</li>
          </ul>
        </div>
      </div>
    </div>
  );
}