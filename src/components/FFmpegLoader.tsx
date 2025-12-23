'use client';

import { logger } from '@/lib/logger';
import { useEffect, useState, useRef } from 'react';

// Función de caché para toBlobURL
const cachedToBlobURL = async (url: string, mimeType: string): Promise<string> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    logger.error(`Error creating blob URL for ${url}:`, error);
    throw error;
  }
};

interface FFmpegLoaderProps {
  onFFmpegReady: (ffmpeg: any, fetchFile: any) => void;
  onError: (error: string) => void;
  onProgress: (progress: number) => void;
}

export default function FFmpegLoader({ onFFmpegReady, onError, onProgress }: FFmpegLoaderProps) {
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const ffmpegRef = useRef<any>(null);
  const fetchFileRef = useRef<any>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const loadFFmpeg = async () => {
    if (!isClient) return;
    
    try {
      setIsLoading(true);
      logger.log('[FFmpeg Loader] Iniciando carga...');
      
      // Cargar los módulos usando require dinámico
      const ffmpegModule = await eval('import("@ffmpeg/ffmpeg")');
      const utilModule = await eval('import("@ffmpeg/util")');
      
      const { FFmpeg } = ffmpegModule;
      const { fetchFile } = utilModule;
      
      if (!ffmpegRef.current) {
        ffmpegRef.current = new FFmpeg();
      }
      
      fetchFileRef.current = fetchFile;
      const ffmpeg = ffmpegRef.current;
      
      if (ffmpeg.loaded) {
        onFFmpegReady(ffmpeg, fetchFile);
        return;
      }
      
      // Configurar eventos
      ffmpeg.on('progress', ({ progress }: any) => {
        onProgress(Math.round(progress * 100));
      });
      
      ffmpeg.on('log', ({ message }: any) => {
        logger.log('[FFmpeg]', message);
      });
      
      // Usar URLs remotas
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      
      await ffmpeg.load({
        coreURL: await cachedToBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await cachedToBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      logger.log('[FFmpeg Loader] Carga completada exitosamente');
      onFFmpegReady(ffmpeg, fetchFile);
      
    } catch (err) {
      logger.error('[FFmpeg Loader] Error:', err);
      onError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isClient) {
    return <div>Cargando...</div>;
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">FFmpeg Loader</h2>
      <div className="space-y-4">
        <button
          onClick={loadFFmpeg}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded"
        >
          {isLoading ? 'Cargando FFmpeg...' : 'Cargar FFmpeg'}
        </button>
        
        {isLoading && (
          <div className="text-yellow-400">
            ⏳ Inicializando FFmpeg...
          </div>
        )}
      </div>
    </div>
  );
}