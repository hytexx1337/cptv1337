'use client';

import React, { useRef } from 'react';
import { DocumentArrowUpIcon } from '@heroicons/react/24/outline';

interface SubtitleControlsProps {
  isSearching: boolean;
  downloadedSubtitles: Array<{
    filename: string;
    language: string;
    url: string;
  }>;
  onFileUpload: (file: File) => void;
}

export default function SubtitleControls({
  isSearching,
  downloadedSubtitles,
  onFileUpload,
}: SubtitleControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Indicador de búsqueda automática */}
      {isSearching && (
        <div className="flex items-center gap-2 text-blue-400 text-sm">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
          <span>Buscando subtítulos automáticamente...</span>
        </div>
      )}

      {/* Botón para cargar subtítulo externo */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".srt,.vtt,.ass,.ssa"
          onChange={handleFileSelect}
          className="hidden"
          id="subtitle-upload"
        />
        <label
          htmlFor="subtitle-upload"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg cursor-pointer transition-colors duration-200"
        >
          <DocumentArrowUpIcon className="w-5 h-5" />
          Cargar subtítulo
        </label>
      </div>

      {/* Lista de subtítulos cargados */}
      {downloadedSubtitles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-300">Subtítulos disponibles:</h4>
          <div className="space-y-1">
            {downloadedSubtitles.map((subtitle, index) => (
              <div
                key={index}
                className="flex items-center justify-between px-3 py-2 bg-gray-800 rounded-lg text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">{subtitle.language}</span>
                  <span className="text-gray-300">{subtitle.filename}</span>
                </div>
                <span className="text-green-400 text-xs">✓ Cargado</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

