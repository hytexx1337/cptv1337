'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { logger, subtitleLogger } from '@/lib/logger';
import { 
  getVideoInfo,
  extractSubtitle as extractVideoSubtitle,
  cleanup,
  validateFile,
  type SubtitleExtractionResult
} from '@opensubtitles/video-metadata-extractor';

interface SubtitleTrack {
  index: number;
  language: string;
  codec: string;
  title?: string;
  default?: boolean;
  forced?: boolean;
}

interface ProcessedVideoMetadata {
  filename: string;
  duration: string;
  resolution: string;
  fps: string;
  format: string;
  size: number;
  subtitleTracks: SubtitleTrack[];
}

interface SubtitleExtractorProps {
  onSubtitleExtracted?: (subtitleContent: string, track: SubtitleTrack) => void;
  onMetadataExtracted?: (metadata: ProcessedVideoMetadata) => void;
  className?: string;
}

export type { SubtitleTrack, ProcessedVideoMetadata };

export default function SubtitleExtractor({ 
  onSubtitleExtracted, 
  onMetadataExtracted,
  className = '' 
}: SubtitleExtractorProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [metadata, setMetadata] = useState<ProcessedVideoMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isBrowser, setIsBrowser] = useState(false);

  // Verificar que estamos en el navegador
  useEffect(() => {
    setIsBrowser(typeof window !== 'undefined');
  }, []);

  // Cleanup FFmpeg resources when component unmounts
  useEffect(() => {
    return () => {
      cleanup().catch(logger.error);
    };
  }, []);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      setMetadata(null);
    }
  }, []);

  const extractMetadata = useCallback(async () => {
    if (!selectedFile || !isBrowser) return;

    // Verificar que estamos en un entorno de navegador con WebAssembly
    if (typeof window === 'undefined' || !window.WebAssembly) {
      setError('FFmpeg WASM requiere un entorno de navegador con soporte para WebAssembly');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      // Validar archivo primero
      const validation = validateFile(selectedFile);
      if (!validation.isValid) {
        throw new Error(`Archivo inválido: ${validation.errors.join(', ')}`);
      }

      // Usar getVideoInfo con opciones específicas
      const videoInfo = await getVideoInfo(selectedFile, {
        debug: true,
        ffmpegCoreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
        ffmpegWasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
        timeout: 30000,
        onProgress: (progressState) => {
          setProgress(progressState.progress);
        },
        onError: (error) => {
          logger.error('FFmpeg error:', error);
        }
      });
      
      // Procesar la información para nuestro formato
      const processedMetadata: ProcessedVideoMetadata = {
        filename: videoInfo.filename,
        duration: videoInfo.duration,
        resolution: videoInfo.resolution,
        fps: videoInfo.fps,
        format: videoInfo.videoCodec || 'unknown', // Usar videoCodec en lugar de format
        size: selectedFile.size,
        subtitleTracks: videoInfo.subtitles.map((subtitle) => ({
          index: subtitle.index,
          language: subtitle.language || 'unknown',
          codec: subtitle.codec || 'unknown',
          title: subtitle.language || 'unknown', // Usando language como fallback para title
          default: subtitle.default || false,
          forced: subtitle.forced || false
        }))
      };

      setMetadata(processedMetadata);
      onMetadataExtracted?.(processedMetadata);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido al extraer metadatos';
      setError(errorMessage);
      logger.error('Error extracting metadata:', err);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  }, [selectedFile, onMetadataExtracted, isBrowser]);

  const extractSubtitle = useCallback(async (trackIndex: number) => {
    if (!selectedFile || !metadata || !isBrowser) return;

    // Verificar que estamos en un entorno de navegador con WebAssembly
    if (typeof window === 'undefined' || !window.WebAssembly) {
      setError('FFmpeg WASM requiere un entorno de navegador con soporte para WebAssembly');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const result = await extractVideoSubtitle(selectedFile, trackIndex, { 
        format: 'srt', 
        quick: false,
        ffmpegCoreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
        ffmpegWasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
        timeout: 30000
      });
      
      if (result && result.data) {
        const subtitleText = new TextDecoder().decode(result.data);
        // Encontrar el track correspondiente en los metadatos
        const track = metadata.subtitleTracks.find(t => t.index === trackIndex);
        if (track) {
          onSubtitleExtracted?.(subtitleText, track);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido al extraer subtítulos';
      setError(errorMessage);
      logger.error('Error extracting subtitle:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, metadata, onSubtitleExtracted, isBrowser]);

  const downloadSubtitle = useCallback(async (track: SubtitleTrack) => {
    if (!selectedFile || !isBrowser) return;

    // Verificar que estamos en un entorno de navegador con WebAssembly
    if (typeof window === 'undefined' || !window.WebAssembly) {
      setError('FFmpeg WASM requiere un entorno de navegador con soporte para WebAssembly');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const result = await extractVideoSubtitle(selectedFile, track.index, { 
      format: 'srt', 
      quick: false,
      ffmpegCoreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
      ffmpegWasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
      timeout: 30000
    });
      
      if (result && result.data) {
        // Convertir Uint8Array a ArrayBuffer para compatibilidad con Blob
        const arrayBuffer = new ArrayBuffer(result.data.length);
        const view = new Uint8Array(arrayBuffer);
        view.set(result.data);
        const blob = new Blob([arrayBuffer], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `subtitle_${track.index}_${track.language}.srt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido al descargar subtítulos';
      setError(errorMessage);
      logger.error('Error downloading subtitle:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, isBrowser]);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 ${className}`}>
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
        Extractor de Subtítulos Embebidos
      </h3>

      {/* Selector de archivo */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Seleccionar archivo de video (MKV, MP4, AVI, etc.)
        </label>
        <input
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500 dark:text-gray-400
                     file:mr-4 file:py-2 file:px-4
                     file:rounded-full file:border-0
                     file:text-sm file:font-semibold
                     file:bg-blue-50 file:text-blue-700
                     hover:file:bg-blue-100
                     dark:file:bg-blue-900 dark:file:text-blue-300"
        />
      </div>

      {/* Botón para extraer metadatos */}
      {selectedFile && !metadata && isBrowser && (
        <button
          onClick={extractMetadata}
          disabled={isProcessing}
          className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing ? 'Analizando...' : 'Analizar Video'}
        </button>
      )}

      {/* Mensaje si no estamos en el navegador */}
      {!isBrowser && (
        <div className="mb-4 p-4 bg-yellow-100 dark:bg-yellow-900 border border-yellow-400 dark:border-yellow-600 rounded-lg">
          <p className="text-yellow-800 dark:text-yellow-200">
            El extractor de subtítulos requiere un entorno de navegador para funcionar correctamente.
          </p>
        </div>
      )}

      {/* Barra de progreso */}
      {isProcessing && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
            <span>Procesando...</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 rounded">
          {error}
        </div>
      )}

      {/* Información del archivo */}
      {selectedFile && (
        <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-700 rounded">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <strong>Archivo:</strong> {selectedFile.name}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <strong>Tamaño:</strong> {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
      )}

      {/* Metadatos y pistas de subtítulos */}
      {metadata && (
        <div className="space-y-4">
          <div className="p-3 bg-green-100 dark:bg-green-900 rounded">
            <h4 className="font-medium text-green-800 dark:text-green-300 mb-2">
              Información del Video
            </h4>
            <p className="text-sm text-green-700 dark:text-green-400">
              <strong>Archivo:</strong> {metadata.filename}
            </p>
            <p className="text-sm text-green-700 dark:text-green-400">
              <strong>Duración:</strong> {metadata.duration}
            </p>
            <p className="text-sm text-green-700 dark:text-green-400">
              <strong>Resolución:</strong> {metadata.resolution}
            </p>
            <p className="text-sm text-green-700 dark:text-green-400">
              <strong>FPS:</strong> {metadata.fps}
            </p>
            <p className="text-sm text-green-700 dark:text-green-400">
              <strong>Formato:</strong> {metadata.format}
            </p>
            <p className="text-sm text-green-700 dark:text-green-400">
              <strong>Subtítulos encontrados:</strong> {metadata.subtitleTracks.length}
            </p>
          </div>

          {/* Lista de pistas de subtítulos */}
          {metadata.subtitleTracks.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                Pistas de Subtítulos Disponibles
              </h4>
              <div className="space-y-2">
                {metadata.subtitleTracks.map((track) => (
                  <div 
                    key={track.index}
                    className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Pista {track.index + 1} - {track.language}
                        {track.title && ` (${track.title})`}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Códec: {track.codec}
                        {track.default && ' • Por defecto'}
                        {track.forced && ' • Forzado'}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => extractSubtitle(track.index)}
                        disabled={isProcessing}
                        className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 
                                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Cargar
                      </button>
                      <button
                        onClick={() => downloadSubtitle(track)}
                        disabled={isProcessing}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 
                                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Descargar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {metadata.subtitleTracks.length === 0 && (
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900 border border-yellow-400 dark:border-yellow-600 text-yellow-700 dark:text-yellow-300 rounded">
              No se encontraron pistas de subtítulos embebidas en este archivo.
            </div>
          )}
        </div>
      )}
    </div>
  );
}