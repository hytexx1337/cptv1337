'use client';

import { logger, streamLogger } from '@/lib/logger';
import React, { useState, useRef } from 'react';

interface TorrentInfo {
  torrentId: string;
  name: string;
  length: number;
  files: Array<{
    index: number;
    name: string;
    length: number;
    path: string;
  }>;
  videoFiles: Array<{
    index: number;
    name: string;
    length: number;
    path: string;
  }>;
}

const CustomTorrentStream: React.FC = () => {
  const [magnetUri, setMagnetUri] = useState('magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torrentInfo, setTorrentInfo] = useState<TorrentInfo | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const SERVER_URL = 'http://31.97.83.87:3001';

  const startStreaming = async () => {
    if (!magnetUri.trim()) {
      setError('Por favor ingresa un enlace magnet válido');
      return;
    }

    setLoading(true);
    setError(null);
    setTorrentInfo(null);
    setStreamUrl(null);

    streamLogger.log('🚀 Iniciando streaming con magnet:', magnetUri);

    try {
      // Get torrent info
      const response = await fetch(`${SERVER_URL}/api/torrent/info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ magnetUri }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al obtener información del torrent');
      }

      const data = await response.json();
      streamLogger.log('📊 Información del torrent:', data);

      setTorrentInfo(data);

      // Auto-select the largest video file
      if (data.videoFiles && data.videoFiles.length > 0) {
        const largestVideo = data.videoFiles[0]; // Already sorted by size
        setSelectedFileIndex(largestVideo.index);
        
        const url = `${SERVER_URL}/api/torrent/stream/${data.torrentId}/${largestVideo.index}`;
        setStreamUrl(url);
        
        streamLogger.log('🎬 URL de streaming generada:', url);
        streamLogger.log('📁 Archivo seleccionado:', largestVideo.name);
      } else {
        setError('No se encontraron archivos de video en este torrent');
      }

    } catch (err) {
      streamLogger.error('❌ Error:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const selectFile = (fileIndex: number) => {
    if (!torrentInfo) return;
    
    setSelectedFileIndex(fileIndex);
    const url = `${SERVER_URL}/api/torrent/stream/${torrentInfo.torrentId}/${fileIndex}`;
    setStreamUrl(url);
    
    streamLogger.log('🎬 Cambiando a archivo:', torrentInfo.files[fileIndex].name);
  };

  const stopStreaming = async () => {
    if (torrentInfo) {
      try {
        await fetch(`${SERVER_URL}/api/torrent/${torrentInfo.torrentId}`, {
          method: 'DELETE',
        });
        streamLogger.log('🛑 Torrent eliminado del servidor');
      } catch (err) {
        streamLogger.error('Error al eliminar torrent:', err);
      }
    }

    setTorrentInfo(null);
    setStreamUrl(null);
    setSelectedFileIndex(null);
    setError(null);
    
    if (videoRef.current) {
      videoRef.current.src = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
        🎬 Custom Torrent Streaming
      </h1>
      
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Enlace Magnet:
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={magnetUri}
            onChange={(e) => setMagnetUri(e.target.value)}
            placeholder="magnet:?xt=urn:btih:..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            onClick={startStreaming}
            disabled={loading || !magnetUri.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? '🔄 Cargando...' : '🚀 Iniciar'}
          </button>
          {torrentInfo && (
            <button
              onClick={stopStreaming}
              className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              🛑 Detener
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
          ❌ {error}
        </div>
      )}

      {torrentInfo && (
        <div className="mb-6 p-4 bg-gray-100 rounded-md">
          <h3 className="text-lg font-semibold mb-2">📊 Información del Torrent:</h3>
          <p><strong>Nombre:</strong> {torrentInfo.name}</p>
          <p><strong>Tamaño total:</strong> {formatFileSize(torrentInfo.length)}</p>
          <p><strong>Archivos totales:</strong> {torrentInfo.files.length}</p>
          <p><strong>Archivos de video:</strong> {torrentInfo.videoFiles.length}</p>
        </div>
      )}

      {torrentInfo && torrentInfo.videoFiles.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">🎥 Archivos de Video:</h3>
          <div className="space-y-2">
            {torrentInfo.videoFiles.map((file) => (
              <div
                key={file.index}
                className={`p-3 border rounded-md cursor-pointer transition-colors ${
                  selectedFileIndex === file.index
                    ? 'bg-blue-100 border-blue-500'
                    : 'bg-gray-50 border-gray-300 hover:bg-gray-100'
                }`}
                onClick={() => selectFile(file.index)}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{file.name}</span>
                  <span className="text-sm text-gray-600">{formatFileSize(file.length)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {streamUrl && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">🎬 Reproductor:</h3>
          <video
            ref={videoRef}
            src={streamUrl}
            controls
            className="w-full max-w-2xl mx-auto rounded-lg shadow-md"
            onError={(e) => {
              streamLogger.error('Error en el video:', e);
              setError('Error al cargar el video. Verifica que el servidor esté funcionando.');
            }}
            onLoadStart={() => streamLogger.log('🎥 Iniciando carga del video...')}
            onCanPlay={() => streamLogger.log('✅ Video listo para reproducir')}
          >
            Tu navegador no soporta el elemento video.
          </video>
          
          <div className="mt-2 text-sm text-gray-600 text-center">
            <p>URL de streaming: <code className="bg-gray-100 px-2 py-1 rounded">{streamUrl}</code></p>
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 rounded-md">
        <h3 className="text-lg font-semibold mb-2">ℹ️ Cómo funciona:</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
          <li>Nuestro servidor Node.js descarga el torrent usando conexiones BitTorrent tradicionales</li>
          <li>Convierte los archivos a streams HTTP que el navegador puede reproducir</li>
          <li>Soporta seeking (saltar a diferentes partes del video)</li>
          <li>Funciona con cualquier torrent que tenga archivos de video</li>
          <li>Completamente gratuito y bajo tu control</li>
        </ul>
      </div>
    </div>
  );
};

export default CustomTorrentStream;