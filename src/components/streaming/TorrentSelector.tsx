'use client';

import React from 'react';

interface TorrentFile {
  index: number;
  name: string;
  size: number;
  path: string;
}

interface TorrentSelectorProps {
  files: TorrentFile[];
  selectedIndex: number | null;
  onSelectFile: (index: number) => void;
}

export default function TorrentSelector({
  files,
  selectedIndex,
  onSelectFile,
}: TorrentSelectorProps) {
  const formatSize = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const extractQuality = (filename: string): string => {
    const qualities = ['2160p', '1080p', '720p', '480p', '360p'];
    for (const quality of qualities) {
      if (filename.toLowerCase().includes(quality)) {
        return quality;
      }
    }
    return 'SD';
  };

  if (files.length === 0) {
    return null;
  }

  if (files.length === 1) {
    return (
      <div className="p-4 bg-gray-800 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-white font-medium">{files[0].name}</p>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
              <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs">
                {extractQuality(files[0].name)}
              </span>
              <span>{formatSize(files[0].size)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-white font-medium">Archivos disponibles:</h3>
      <div className="space-y-2">
        {files.map((file, index) => (
          <button
            key={file.index}
            onClick={() => onSelectFile(file.index)}
            className={`w-full p-3 rounded-lg transition-all duration-200 text-left ${
              selectedIndex === file.index
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-4">
                <p className="font-medium line-clamp-1">{file.name}</p>
                <div className="flex items-center gap-3 mt-1 text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    selectedIndex === file.index
                      ? 'bg-white text-blue-600'
                      : 'bg-gray-700 text-gray-300'
                  }`}>
                    {extractQuality(file.name)}
                  </span>
                  <span className="opacity-75">{formatSize(file.size)}</span>
                </div>
              </div>
              {selectedIndex === file.index && (
                <div className="text-white">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

