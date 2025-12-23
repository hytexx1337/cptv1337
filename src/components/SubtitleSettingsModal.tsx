'use client';

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { XMarkIcon, MagnifyingGlassIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { logger } from '@/lib/logger';
import { subtitlesService, type SubtitleFile } from '@/lib/subtitles-service';

// Función para aplicar offset de sincronización al contenido VTT
function applySyncOffsetToVTT(vttContent: string, offsetSeconds: number): string {
  if (!vttContent || offsetSeconds === 0) return vttContent;

  const lines = vttContent.split('\n');
  const timeRegex = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/;
  
  const adjustTime = (hours: number, minutes: number, seconds: number, milliseconds: number, offset: number): string => {
    const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds + (offset * 1000);
    
    if (totalMs < 0) return '00:00:00.000';
    
    const newHours = Math.floor(totalMs / 3600000);
    const newMinutes = Math.floor((totalMs % 3600000) / 60000);
    const newSeconds = Math.floor((totalMs % 60000) / 1000);
    const newMs = totalMs % 1000;
    
    return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}:${String(newSeconds).padStart(2, '0')}.${String(newMs).padStart(3, '0')}`;
  };

  const processedLines = lines.map(line => {
    const match = line.match(timeRegex);
    if (match) {
      const [, h1, m1, s1, ms1, h2, m2, s2, ms2] = match;
      const startTime = adjustTime(parseInt(h1), parseInt(m1), parseInt(s1), parseInt(ms1), offsetSeconds);
      const endTime = adjustTime(parseInt(h2), parseInt(m2), parseInt(s2), parseInt(ms2), offsetSeconds);
      return `${startTime} --> ${endTime}`;
    }
    return line;
  });

  return processedLines.join('\n');
}

interface SubtitleSettings {
  offset: number;
  fontPercent?: number; // 0.5 = 50%, 1.0 = 100%, 2.0 = 200%
  textColor?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  fontFamily?: string;
  position?: 'top' | 'bottom';
}

interface OpenSubtitlesResult {
  id: string;
  type: string;
  attributes: {
    subtitle_id: string;
    language: string;
    download_count: number;
    new_download_count: number;
    hearing_impaired: boolean;
    hd: boolean;
    fps: number;
    votes: number;
    points: number;
    ratings: number;
    from_trusted: boolean;
    foreign_parts_only: boolean;
    ai_translated: boolean;
    machine_translated: boolean;
    upload_date: string;
    release: string;
    comments: string;
    legacy_subtitle_id: number;
    uploader: {
      uploader_id: number;
      name: string;
      rank: string;
    };
    feature_details: {
      feature_id: number;
      feature_type: string;
      year: number;
      title: string;
      movie_name: string;
      imdb_id: number;
      tmdb_id: number;
    };
    url: string;
    related_links: {
      label: string;
      url: string;
      img_url: string;
    }[];
    files: Array<{
      file_id: number;
      cd_number: number;
      file_name: string;
    }>;
  };
}

interface SubdivxResult {
  title: string;
  description: string;
  downloadUrl: string;
  rating: number;
  downloads: number;
  date: string;
}

interface SubdivxSubtitleFile {
  name: string;
  content: string;
  filePath?: string;
  language: string;
}

interface SubtitleSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (settings: SubtitleSettings) => void;
  currentSettings?: Partial<SubtitleSettings>;
  movieTitle?: string;
  imdbId?: string;
  tmdbId?: string | number;
  season?: number;
  episode?: number;
  isTV?: boolean;
  playerRef?: React.RefObject<any>; // Referencia al reproductor Video.js
  movieHash?: string; // Hash del archivo de video para búsqueda precisa
  movieByteSize?: number; // Tamaño del archivo para búsqueda precisa
  onConfirmSubtitles?: (subtitleData: any) => void; // Nueva prop para confirmar subtítulos
}

export default function SubtitleSettingsModal({
  isOpen,
  onClose,
  onApply,
  currentSettings = {},
  movieTitle,
  imdbId,
  tmdbId,
  season,
  episode,
  isTV = false,
  playerRef,
  movieHash,
  movieByteSize,
  onConfirmSubtitles,
}: SubtitleSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'settings' | 'search' | 'subdivx'>('settings');
  const [settings, setSettings] = useState<SubtitleSettings>({
    offset: 0,
    fontPercent: 1.0,
    textColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.75,
    fontFamily: 'Arial, sans-serif',
    position: 'bottom',
    ...currentSettings,
  });

  // Estados para la búsqueda de subtítulos
  const [searchResults, setSearchResults] = useState<OpenSubtitlesResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'downloads' | 'rating' | 'date'>('downloads');

  // Estados para la búsqueda de Subdivx
  const [subdivxResults, setSubdivxResults] = useState<SubdivxResult[]>([]);
  const [isSearchingSubdivx, setIsSearchingSubdivx] = useState(false);
  const [isDownloadingSubdivx, setIsDownloadingSubdivx] = useState(false);
  const [downloadingSubdivxId, setDownloadingSubdivxId] = useState<string | null>(null);

  // Estado para trackear fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Listener para detectar cambios en fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement !== null);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    logger.log('🎨 [SUBTITLE-MODAL] Estado isOpen cambió a:', isOpen);
    if (isOpen) {
      logger.log('✅ [SUBTITLE-MODAL] Modal abriéndose');
      // Buscar subtítulos automáticamente cuando se abre el modal
      if (activeTab === 'search' && movieTitle && searchResults.length === 0) {
        searchSubtitles();
      }
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    logger.log('🔄 [SUBTITLE-MODAL] currentSettings cambió:', currentSettings);
    setSettings(prev => ({ ...prev, ...currentSettings }));
  }, [currentSettings]);

  // Función para buscar subtítulos en Subdivx
  const searchSubdivxSubtitles = async () => {
    if (!movieTitle) {
      logger.warn('❌ [SUBDIVX-SEARCH] No hay título de película para búsqueda');
      return;
    }

    setIsSearchingSubdivx(true);
    try {
      // Construir la consulta correctamente para series de TV
      let searchQuery = movieTitle;
      
      // Si es una serie de TV y tenemos season/episode, formatear correctamente
      if ((isTV || (season !== undefined && episode !== undefined)) && season && episode) {
        // Extraer el nombre base de la serie (remover cualquier formato S##E## existente)
        const seriesName = movieTitle.replace(/\s+S\d+E\d+.*$/i, '').trim();
        // Formatear con ceros a la izquierda: S02E07
        searchQuery = `${seriesName} S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`;
        logger.log('🔍 [SUBDIVX-SEARCH] Consulta formateada para serie:', searchQuery);
      }
      
      logger.log('🔍 [SUBDIVX-SEARCH] Iniciando búsqueda en Subdivx:', searchQuery);
      
      const response = await fetch(`/api/subtitles/subdivx?query=${encodeURIComponent(searchQuery)}&autoDownload=false`);
      
      if (!response.ok) {
        throw new Error(`Error en búsqueda Subdivx: ${response.status}`);
      }
      
      const data = await response.json();
      setSubdivxResults(data.results || []);
      
      logger.log(`✅ [SUBDIVX-SEARCH] Encontrados ${data.results?.length || 0} subtítulos en Subdivx`);
    } catch (error) {
      logger.error('❌ [SUBDIVX-SEARCH] Error:', error);
      setSubdivxResults([]);
    } finally {
      setIsSearchingSubdivx(false);
    }
  };

  // Función para descargar y cargar un subtítulo de Subdivx
  const downloadAndLoadSubdivxSubtitle = async (result: SubdivxResult) => {
    setIsDownloadingSubdivx(true);
    setDownloadingSubdivxId(result.downloadUrl);
    
    try {
      logger.log('⬇️ [SUBDIVX-DOWNLOAD] Descargando subtítulo:', result.title);
      
      // Construir la consulta correctamente para series de TV (igual que en searchSubdivxSubtitles)
      let searchQuery = movieTitle || '';
      
      // Si es una serie de TV y tenemos season/episode, formatear correctamente
      if ((isTV || (season !== undefined && episode !== undefined)) && season && episode) {
        // Extraer el nombre base de la serie (remover cualquier formato S##E## existente)
        const seriesName = (movieTitle || '').replace(/\s+S\d+E\d+.*$/i, '').trim();
        // Formatear con ceros a la izquierda: S02E07
        searchQuery = `${seriesName} S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`;
      }
      
      const response = await fetch(`/api/subtitles/subdivx?query=${encodeURIComponent(searchQuery)}&autoDownload=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          downloadUrl: result.downloadUrl
        })
      });
      
      if (!response.ok) {
        throw new Error(`Error descargando subtítulo: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.subtitleFiles && data.subtitleFiles.length > 0) {
        const subtitleFile = data.subtitleFiles[0];
        
        logger.log('📝 [SUBDIVX-DOWNLOAD] Subtítulo descargado:', subtitleFile.name);
        
        // Cargar el subtítulo en el reproductor
        if (playerRef?.current) {
          // Crear blob URL para el contenido VTT
          const blob = new Blob([subtitleFile.content], { type: 'text/vtt' });
          const url = URL.createObjectURL(blob);
          
          // Agregar track de subtítulos al reproductor
          const player = playerRef.current;
          
          // Remover tracks existentes del mismo idioma
          const existingTracks = player.textTracks();
          for (let i = 0; i < existingTracks.length; i++) {
            const track = existingTracks[i];
            if (track.language === subtitleFile.language) {
              player.removeRemoteTextTrack(track);
            }
          }
          
          // Agregar nuevo track
          player.addRemoteTextTrack({
            kind: 'subtitles',
            src: url,
            srclang: subtitleFile.language,
            label: `${subtitleFile.language.toUpperCase()} - ${subtitleFile.name}`,
            default: true
          }, false);
          
          logger.log('✅ [SUBDIVX-DOWNLOAD] Subtítulo cargado en el reproductor');
          
          // Activar el subtítulo después de un breve delay
          setTimeout(() => {
            const textTracks = player.textTracks();
            if (textTracks.length > 0) {
              // Desactivar otros subtítulos
              for (let i = 0; i < textTracks.length - 1; i++) {
                textTracks[i].mode = 'disabled';
              }
              // Activar el nuevo subtítulo
              textTracks[textTracks.length - 1].mode = 'showing';
              logger.log('🎯 [SUBDIVX-DOWNLOAD] Subtítulo activado automáticamente');
            }
          }, 500);
        }
        
        onClose(); // Cerrar modal después de cargar
      } else {
        throw new Error('No se encontraron archivos de subtítulos en la respuesta');
      }
    } catch (error) {
      logger.error('❌ [SUBDIVX-DOWNLOAD] Error:', error);
    } finally {
      setIsDownloadingSubdivx(false);
      setDownloadingSubdivxId(null);
    }
  };

  // Función para buscar subtítulos usando el mismo método que la búsqueda automática
  const searchSubtitles = async () => {
    // Verificar que tenemos al menos un parámetro de búsqueda válido
    if (!movieTitle && !imdbId && !tmdbId && !movieHash) {
      logger.warn('❌ [SUBTITLE-SEARCH] No hay parámetros suficientes para búsqueda');
      return;
    }

    setIsSearching(true);
    try {
      logger.log('🔍 [SUBTITLE-SEARCH] Iniciando búsqueda con parámetros:', {
        movieHash,
        movieByteSize,
        imdbId,
        tmdbId,
        season,
        episode,
        isTV,
        movieTitle
      });

      let subtitles: any[] = [];

      // Agregar logs de debug para ver qué valores tenemos
      logger.log('🔍 [DEBUG] Modal search params:', {
        isTV,
        season,
        episode,
        imdbId,
        tmdbId,
        movieTitle,
        movieHash,
        movieByteSize
      });

      // Usar el mismo método que la búsqueda automática: findSubtitlesForVideo
      logger.log('✅ [SUBTITLE-SEARCH] Usando findSubtitlesForVideo (igual que búsqueda automática)');
      
      // 🔒 [FIX] Crear un archivo mock para el hash solo en el browser (no en build)
      const videoFile = typeof window !== 'undefined' && movieHash && movieByteSize ? {
        name: movieTitle || 'video.mkv',
        size: movieByteSize,
        // Mock file object para que funcione con findSubtitlesForVideo
        slice: () => new Blob(),
        type: 'video/x-matroska'
      } as File : null;
      
      // Detectar si es TV basado en la presencia de season/episode, no solo en isTV prop
      const isTVSeries = isTV || (season !== undefined && episode !== undefined);
      
      const metadata = {
        imdbId,
        tmdbId,
        title: movieTitle,
        season: isTVSeries ? season : undefined,
        episode: isTVSeries ? episode : undefined,
      };
      
      logger.log('🔍 [DEBUG] Metadata being passed:', metadata);
      
      if (videoFile) {
        // Si tenemos hash, usar findSubtitlesForVideo que maneja todo correctamente
        subtitles = await subtitlesService.findSubtitlesForVideo(videoFile, metadata);
      } else {
        // Fallback: usar searchSubtitles directamente
        logger.log('✅ [SUBTITLE-SEARCH] Usando searchSubtitles como fallback');
        
        const searchParams: any = {
          languages: selectedLanguage === 'all' ? ['es', 'en'] : [selectedLanguage],
        };

        if (imdbId) {
          searchParams.imdbId = imdbId;
        } else if (tmdbId) {
          searchParams.tmdbId = tmdbId;
        } else if (movieTitle) {
          searchParams.query = movieTitle;
        }

        // Incluir season y episode para series
        if (isTVSeries && season) {
          searchParams.season = season;
        }
        if (isTVSeries && episode) {
          searchParams.episode = episode;
        }

        logger.log('🔍 [DEBUG] SearchParams being passed:', searchParams);
        subtitles = await subtitlesService.searchSubtitles(searchParams);
      }
      
      // Convertir al formato esperado por el modal
      const formattedResults = subtitles.map(subtitle => ({
        id: subtitle.id,
        type: 'subtitle',
        attributes: {
          subtitle_id: subtitle.id,
          language: subtitle.language,
          download_count: subtitle.downloads || 0,
          new_download_count: subtitle.downloads || 0,
          hearing_impaired: false,
          hd: false,
          fps: 0,
          votes: 0,
          points: 0,
          ratings: 0,
          from_trusted: false,
          foreign_parts_only: false,
          ai_translated: false,
          machine_translated: false,
          upload_date: '',
          release: subtitle.filename || '',
          comments: '',
          legacy_subtitle_id: 0,
          uploader: {
            uploader_id: 0,
            name: '',
            rank: ''
          },
          feature_details: {
            feature_id: 0,
            feature_type: isTV ? 'episode' : 'movie',
            year: 0,
            title: movieTitle || '',
            movie_name: movieTitle || '',
            imdb_id: 0,
            tmdb_id: 0
          },
          url: subtitle.url,
          related_links: [],
          files: [{
            file_id: 0,
            cd_number: 1,
            file_name: subtitle.filename || ''
          }]
        }
      }));

      setSearchResults(formattedResults);
      logger.log('🔍 [SUBTITLE-SEARCH] Encontrados:', formattedResults.length, 'subtítulos');
      
    } catch (error) {
      logger.error('❌ [SUBTITLE-SEARCH] Error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Función auxiliar para convertir SRT a VTT
  const convertSrtToVtt = (srtContent: string): string => {
    let vttContent = 'WEBVTT\n\n';
    
    try {
      // Limpiar el contenido y dividir en líneas
      const lines = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      const result = [];
      let currentSubtitle = [];
      
      // Regex para timestamps válidos
      const timestampRegex = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$/;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Línea vacía - procesar subtítulo actual si existe
        if (line === '') {
          if (currentSubtitle.length > 0) {
            // Validar que tenemos al menos un timestamp y texto
            const hasValidTimestamp = currentSubtitle.some(l => timestampRegex.test(l));
            const hasText = currentSubtitle.some(l => !timestampRegex.test(l) && !/^\d+$/.test(l) && l.trim() !== '');
            
            if (hasValidTimestamp && hasText) {
              result.push(...currentSubtitle);
              result.push(''); // Línea vacía entre subtítulos
            }
            currentSubtitle = [];
          }
          continue;
        }
        
        // Número de secuencia (solo números)
        if (/^\d+$/.test(line)) {
          continue;
        }
        
        // Timestamp - convertir comas a puntos
        if (timestampRegex.test(line)) {
          const vttTimestamp = line.replace(/,/g, '.');
          currentSubtitle.push(vttTimestamp);
          continue;
        }
        
        // Texto del subtítulo
        if (line.length > 0) {
          currentSubtitle.push(line);
        }
      }
      
      // Procesar último subtítulo
      if (currentSubtitle.length > 0) {
        const hasValidTimestamp = currentSubtitle.some(l => timestampRegex.test(l));
        const hasText = currentSubtitle.some(l => !timestampRegex.test(l) && !/^\d+$/.test(l) && l.trim() !== '');
        
        if (hasValidTimestamp && hasText) {
          result.push(...currentSubtitle);
        }
      }
      
      vttContent += result.join('\n');
      return vttContent;
      
    } catch (error) {
      logger.error('❌ [SUBTITLE-CONVERT] Error en conversión:', error);
      return 'WEBVTT\n\n';
    }
  };

  // Función para descargar y cargar un subtítulo específico
  const downloadAndLoadSubtitle = async (subtitle: OpenSubtitlesResult) => {
    setIsDownloading(true);
    setDownloadingId(subtitle.id);
    
    try {
      // Verificar que el subtítulo tenga archivos disponibles
      const files = subtitle.attributes.files;
      
      if (!files || files.length === 0) {
        logger.log('❌ [SUBTITLE-DOWNLOAD] No hay archivos disponibles:', {
          subtitle_id: subtitle.attributes.subtitle_id,
          files: files
        });
        throw new Error('Este subtítulo no tiene archivos disponibles para descarga');
      }

      const fileId = files[0]?.file_id;

      // Si file_id es 0, intentar usar subtitle_id como alternativa
      const downloadId = fileId && fileId !== 0 ? fileId : subtitle.attributes.subtitle_id;

      logger.log('🔍 [SUBTITLE-DOWNLOAD] Intentando descargar subtítulo:', {
        subtitle_id: subtitle.attributes.subtitle_id,
        file_id: fileId,
        download_id: downloadId,
        using_subtitle_id_fallback: fileId === 0 || !fileId,
        language: subtitle.attributes.language,
        release: subtitle.attributes.release
      });

      const response = await fetch('/api/subtitles/opensubtitles-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_id: downloadId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.log('❌ [SUBTITLE-DOWNLOAD] Error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          attempted_id: downloadId,
          was_fallback: fileId === 0 || !fileId
        });
        throw new Error(`Error descargando subtítulo: ${response.status} - ${errorText}`);
      }

      // El endpoint devuelve JSON con filePath al SRT guardado
      let srtContent = '';
      try {
        const data = await response.json();
        if (data?.filePath) {
          logger.log('📄 [SUBTITLE-DOWNLOAD] filePath recibido:', data.filePath);
          // Obtener el SRT real desde el servidor (servir ruta con headers correctos)
          const serveUrl = data.filePath.startsWith('/subtitles/')
            ? `/api/subtitles/serve/${data.filePath.split('/').pop()}`
            : data.filePath;
          const srtResp = await fetch(serveUrl);
          if (!srtResp.ok) {
            const errTxt = await srtResp.text();
            logger.error('❌ [SUBTITLE-DOWNLOAD] Error trayendo SRT desde filePath:', {
              status: srtResp.status,
              body: errTxt,
              serveUrl
            });
            throw new Error('No se pudo obtener el SRT desde el servidor');
          }
          srtContent = await srtResp.text();
        } else {
          logger.warn('⚠️ [SUBTITLE-DOWNLOAD] Respuesta sin filePath, intentando como texto');
          srtContent = await response.text();
        }
      } catch (jsonErr) {
        logger.warn('⚠️ [SUBTITLE-DOWNLOAD] No se pudo parsear JSON, intentando texto plano:', jsonErr);
        srtContent = await response.text();
      }

      if (srtContent) {
        logger.log('✅ [SUBTITLE-DOWNLOAD] SRT obtenido, longitud:', srtContent.length);
        
        // Convertir SRT a VTT
        const vttContent = convertSrtToVtt(srtContent);
        
        // Crear blob URL para el VTT
        const vttBlob = new Blob([vttContent], { type: 'text/vtt' });
        const vttUrl = URL.createObjectURL(vttBlob);
        
        logger.log('✅ [SUBTITLE-DOWNLOAD] Convertido a VTT:', vttUrl);
        
        // Integrar con el reproductor Video.js
        if (playerRef?.current) {
          const player = playerRef.current;
          
          // Remover subtítulos existentes
          const existingTracks = player.textTracks();
          for (let i = existingTracks.length - 1; i >= 0; i--) {
            const track = existingTracks[i];
            if (track.kind === 'subtitles') {
              track.mode = 'disabled';
            }
          }
          
          // Agregar nuevo subtítulo
          player.addRemoteTextTrack({
            kind: 'subtitles',
            src: vttUrl,
            srclang: subtitle.attributes.language,
            label: `${subtitle.attributes.language.toUpperCase()} - ${subtitle.attributes.release}`,
            default: true
          }, false);
          
          // Habilitar el subtítulo
          setTimeout(() => {
            const tracks = player.textTracks();
            for (let i = 0; i < tracks.length; i++) {
              const track = tracks[i];
              if (track.kind === 'subtitles' && track.language === subtitle.attributes.language) {
                track.mode = 'showing';
                try {
                  const cues = track.cues;
                  logger.log('🔍 [SUBTITLE-DOWNLOAD] Cues en track activado:', cues ? cues.length : 'N/A');
                } catch {}
                break;
              }
            }
          }, 100);
        }
        
        onClose(); // Cerrar modal después de cargar
      }
    } catch (error) {
      logger.error('❌ [SUBTITLE-DOWNLOAD] Error:', error);
    } finally {
      setIsDownloading(false);
      setDownloadingId(null);
    }
  };

  // Filtrar y ordenar resultados
  const filteredAndSortedResults = searchResults
    .filter(subtitle => {
      if (selectedLanguage === 'all') return true;
      return subtitle.attributes.language === selectedLanguage;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'downloads':
          return b.attributes.download_count - a.attributes.download_count;
        case 'rating':
          return b.attributes.ratings - a.attributes.ratings;
        case 'date':
          return new Date(b.attributes.upload_date).getTime() - new Date(a.attributes.upload_date).getTime();
        default:
          return 0;
      }
    });

  // Obtener idiomas únicos de los resultados
  const availableLanguages = Array.from(
    new Set(searchResults.map(s => s.attributes.language))
  ).sort();

  // Nueva función para confirmar subtítulos sincronizados
  const handleConfirmSubtitles = async () => {
    if (!playerRef?.current) {
      logger.error('❌ [SUBTITLE-CONFIRM] No hay reproductor disponible');
      return;
    }

    try {
      const player = playerRef.current;
      const textTracks = player.textTracks();
      let activeSubtitle = null;
      let vttContent = null;
      let syncOffset = 0;

      // Obtener el offset de sincronización del plugin si existe
      try {
        logger.log('🔍 [SUBTITLE-CONFIRM] Buscando plugin de sincronización...');
        
        // Verificar diferentes formas de acceder al plugin
        const subtitleSyncPlugin = (player as any).subtitleSync;
        const pluginInstance = (player as any).subtitleSync_;
        
        logger.log('🔍 [SUBTITLE-CONFIRM] Plugin function:', !!subtitleSyncPlugin);
        logger.log('🔍 [SUBTITLE-CONFIRM] Plugin instance:', !!pluginInstance);
        
        if (pluginInstance) {
          logger.log('🔍 [SUBTITLE-CONFIRM] Plugin instance properties:', Object.keys(pluginInstance));
          if (typeof pluginInstance.offset !== 'undefined') {
            syncOffset = pluginInstance.offset;
            logger.log(`🔄 [SUBTITLE-CONFIRM] Offset de sincronización detectado: ${syncOffset}s`);
          } else {
            logger.warn('⚠️ [SUBTITLE-CONFIRM] Plugin instance no tiene propiedad offset');
          }
        } else if (subtitleSyncPlugin && typeof subtitleSyncPlugin === 'function') {
          logger.log('🔍 [SUBTITLE-CONFIRM] Intentando obtener offset del plugin function...');
          // Intentar llamar al plugin para obtener el offset
          try {
            const result = subtitleSyncPlugin();
            logger.log('🔍 [SUBTITLE-CONFIRM] Resultado del plugin:', result);
          } catch (pluginError) {
            logger.warn('⚠️ [SUBTITLE-CONFIRM] Error llamando al plugin:', pluginError);
          }
        } else {
          logger.warn('⚠️ [SUBTITLE-CONFIRM] No se encontró plugin de sincronización');
        }
        
        // También verificar si hay offset en currentSettings
        if (currentSettings.offset && currentSettings.offset !== 0) {
          syncOffset = currentSettings.offset;
          logger.log(`🔄 [SUBTITLE-CONFIRM] Usando offset de currentSettings: ${syncOffset}s`);
        }
        
      } catch (error) {
        logger.warn('⚠️ [SUBTITLE-CONFIRM] No se pudo obtener offset de sincronización:', error);
      }

      // Encontrar el subtítulo activo
      for (let i = 0; i < textTracks.length; i++) {
        const track = textTracks[i];
        if (track.mode === 'showing' && track.kind === 'subtitles') {
          // Intentar obtener el contenido VTT
          if (track.src && track.src.startsWith('blob:')) {
            try {
              logger.log('🔍 [SUBTITLE-CONFIRM] Obteniendo contenido VTT desde blob URL:', track.src);
              const response = await fetch(track.src);
              if (response.ok) {
                vttContent = await response.text();
                
                // Aplicar offset de sincronización al contenido VTT si existe
                if (syncOffset !== 0 && vttContent) {
                  logger.log(`🔄 [SUBTITLE-CONFIRM] Aplicando offset de ${syncOffset}s al contenido VTT...`);
                  logger.log(`🔄 [SUBTITLE-CONFIRM] Contenido VTT original (primeras 200 chars):`, vttContent.substring(0, 200));
                  
                  const modifiedVttContent = applySyncOffsetToVTT(vttContent, syncOffset);
                  
                  logger.log(`🔄 [SUBTITLE-CONFIRM] Contenido VTT modificado (primeras 200 chars):`, modifiedVttContent.substring(0, 200));
                  
                  if (modifiedVttContent !== vttContent) {
                    vttContent = modifiedVttContent;
                    logger.log(`✅ [SUBTITLE-CONFIRM] Offset de ${syncOffset}s aplicado correctamente al contenido VTT`);
                  } else {
                    logger.warn(`⚠️ [SUBTITLE-CONFIRM] El contenido VTT no cambió después de aplicar el offset`);
                  }
                } else {
                  logger.log(`ℹ️ [SUBTITLE-CONFIRM] No se aplicó offset: syncOffset=${syncOffset}, vttContent=${!!vttContent}`);
                }
                
                logger.log('✅ [SUBTITLE-CONFIRM] Contenido VTT obtenido exitosamente');
              } else {
                logger.warn('⚠️ [SUBTITLE-CONFIRM] Error obteniendo contenido VTT:', response.status);
              }
            } catch (error) {
              logger.warn('⚠️ [SUBTITLE-CONFIRM] Error accediendo al blob URL:', error);
            }
          }

          activeSubtitle = {
            subtitle: {
              language: track.language || 'unknown',
              label: track.label || 'Unknown',
              src: track.src || '',
              vttContent: vttContent, // Contenido VTT con sincronización aplicada
              settings: {
                ...currentSettings,
                syncOffset: syncOffset // Incluir el offset en los settings
              },
              confirmedAt: new Date().toISOString(),
            },
            movieTitle,
            imdbId,
            tmdbId,
            season,
            episode,
            isTV,
            movieHash,
            movieByteSize,
          };
          break;
        }
      }

      if (!activeSubtitle) {
        logger.error('❌ [SUBTITLE-CONFIRM] No hay subtítulos activos para confirmar');
        return;
      }

      logger.log('✅ [SUBTITLE-CONFIRM] Confirmando subtítulos:', {
        ...activeSubtitle,
        vttContent: vttContent ? `${vttContent.length} caracteres` : 'No disponible',
        syncOffset: syncOffset
      });

      // Llamar al callback si está disponible
      if (onConfirmSubtitles) {
        await onConfirmSubtitles(activeSubtitle);
      }

      // También podríamos enviar directamente al VPS aquí
      const response = await fetch('/api/subtitles/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(activeSubtitle),
      });

      if (response.ok) {
        logger.log('✅ [SUBTITLE-CONFIRM] Subtítulos guardados en VPS');
        // Mostrar notificación de éxito (podrías agregar un toast aquí)
      } else {
        logger.error('❌ [SUBTITLE-CONFIRM] Error guardando subtítulos en VPS');
      }

    } catch (error) {
      logger.error('❌ [SUBTITLE-CONFIRM] Error confirmando subtítulos:', error);
    }
  };

  const handleApply = () => {
    logger.log('🎯 [SUBTITLE-MODAL] Aplicando settings:', settings);
    logger.log('📊 [SUBTITLE-MODAL] Offset actual:', settings.offset);
    onApply(settings);
    onClose();
  };

  const handleReset = () => {
    const defaultSettings: SubtitleSettings = {
      offset: 0,
      fontPercent: 1.0,
      textColor: '#FFFFFF',
      backgroundColor: '#000000',
      backgroundOpacity: 0.75,
      fontFamily: 'Arial, sans-serif',
      position: 'bottom',
    };
    setSettings(defaultSettings);
    onApply(defaultSettings);
  };

  if (!isOpen) return null;

  // Detectar si está en fullscreen y usar el contenedor apropiado
  if (typeof document === 'undefined') return null;

  // En fullscreen, el player es el fullscreen element, fuera de fullscreen usamos body
  const targetContainer = isFullscreen 
    ? (document.fullscreenElement || document.body)
    : document.body;

  // Estilos inline para fullscreen
  const buttonStyle = {
    padding: '0.375rem 0.5rem',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: 'white',
    fontSize: '0.75rem',
    borderRadius: '0.5rem',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 500,
    flexShrink: 0,
    transition: 'background-color 0.2s'
  };

  const inputStyle = {
    width: '100%',
    height: '0.5rem',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: '0.5rem',
    appearance: 'none' as const,
    cursor: 'pointer'
  };

  const selectStyle = {
    width: '100%',
    padding: '0.5rem',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: 'white',
    fontSize: '0.875rem',
    borderRadius: '0.5rem',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    cursor: 'pointer',
    outline: 'none'
  };

  const textInputStyle = {
    padding: '0.25rem 0.5rem',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: 'white',
    fontSize: '0.75rem',
    borderRadius: '0.25rem',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    outline: 'none',
    fontFamily: 'monospace'
  };

  const modalContent = (
    <div 
      className="inset-0 flex items-end justify-end p-4 pb-36" 
      style={{ 
        position: isFullscreen ? 'absolute' : 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        padding: '1rem',
        paddingBottom: '9rem',
        zIndex: 2147483647, 
        pointerEvents: 'none' 
      }}
    >
      {/* Backdrop sin blur para mantener el video nítido */}
      <div 
        className="absolute inset-0 bg-black/80 transition-all duration-300 ease-out"
        style={{ 
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          pointerEvents: 'auto' 
        }}
        onClick={onClose}
      />

      {/* Modal compacto y elegante */}
      <div 
        data-fullscreen={isFullscreen}
        style={{ 
          position: 'relative',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: '1rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          width: '100%',
          maxWidth: '28rem',
          pointerEvents: 'auto',
          fontFamily: 'var(--font-poppins), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: 'white',
          overflow: 'hidden'
        }}
      >
        {/* Header con pestañas */}
        <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'white', margin: 0 }}>Subtítulos</h2>
            <button
              onClick={onClose}
              style={{ 
                padding: '0.375rem', 
                borderRadius: '0.5rem', 
                cursor: 'pointer', 
                border: 'none', 
                background: 'transparent',
                color: 'rgba(255, 255, 255, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <XMarkIcon style={{ width: '1.25rem', height: '1.25rem' }} />
            </button>
          </div>
          
          {/* Pestañas */}
          <div style={{ display: 'flex' }}>
            <button
              onClick={() => setActiveTab('settings')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                ...(activeTab === 'settings'
                  ? {
                      color: 'white',
                      borderBottom: '2px solid rgb(59, 130, 246)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)'
                    }
                  : {
                      color: 'rgba(255, 255, 255, 0.7)',
                      backgroundColor: 'transparent',
                      borderBottom: 'none'
                    })
              }}
            >
              <Cog6ToothIcon style={{ width: '1rem', height: '1rem' }} />
              Configuración
            </button>
            <button
              onClick={() => {
                setActiveTab('search');
                if (movieTitle && searchResults.length === 0) {
                  searchSubtitles();
                }
              }}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                ...(activeTab === 'search'
                  ? {
                      color: 'white',
                      borderBottom: '2px solid rgb(59, 130, 246)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)'
                    }
                  : {
                      color: 'rgba(255, 255, 255, 0.7)',
                      backgroundColor: 'transparent',
                      borderBottom: 'none'
                    })
              }}
            >
              <MagnifyingGlassIcon style={{ width: '1rem', height: '1rem' }} />
              OpenSubtitles
            </button>
            <button
              onClick={() => {
                setActiveTab('subdivx');
                if (movieTitle && subdivxResults.length === 0) {
                  searchSubdivxSubtitles();
                }
              }}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                ...(activeTab === 'subdivx'
                  ? {
                      color: 'white',
                      borderBottom: '2px solid rgb(59, 130, 246)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)'
                    }
                  : {
                      color: 'rgba(255, 255, 255, 0.7)',
                      backgroundColor: 'transparent',
                      borderBottom: 'none'
                    })
              }}
            >
              <MagnifyingGlassIcon style={{ width: '1rem', height: '1rem' }} />
              Subdivx
            </button>
          </div>
        </div>

        {/* Content dinámico según pestaña activa */}
        <div style={{ padding: '1rem' }}>
          {activeTab === 'settings' ? (
            // Contenido de configuración (existente)
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Sincronización */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', margin: 0 }}>Sincronización</h3>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', overflow: 'hidden' }}>
                  <button
                    onClick={() => setSettings({ ...settings, offset: settings.offset - 0.5 })}
                    style={buttonStyle}
                  >
                    -0.5s
                  </button>
                  <button
                    onClick={() => setSettings({ ...settings, offset: settings.offset - 0.1 })}
                    style={buttonStyle}
                  >
                    -0.1s
                  </button>
                  <div style={{ flex: 1, textAlign: 'center', minWidth: '70px', maxWidth: '80px' }}>
                    <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1rem' }}>
                      {settings.offset >= 0 ? '+' : ''}{settings.offset.toFixed(1)}s
                    </div>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, offset: settings.offset + 0.1 })}
                    style={buttonStyle}
                  >
                    +0.1s
                  </button>
                  <button
                    onClick={() => setSettings({ ...settings, offset: settings.offset + 0.5 })}
                    style={buttonStyle}
                  >
                    +0.5s
                  </button>
                </div>
              </div>

              {/* Tamaño de fuente */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', margin: 0 }}>Tamaño</h3>
                  <span style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)' }}>{Math.round((settings.fontPercent || 1.0) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={settings.fontPercent || 1.0}
                  onChange={(e) => {
                    const newFontPercent = parseFloat(e.target.value);
                    const newSettings = { ...settings, fontPercent: newFontPercent };
                    setSettings(newSettings);
                    onApply(newSettings); // Aplicar cambios en tiempo real
                  }}
                  style={inputStyle}
                />
              </div>

              {/* Colores en una fila */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                {/* Color del texto */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', margin: 0 }}>Color</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="color"
                      value={settings.textColor}
                      onChange={(e) => setSettings({ ...settings, textColor: e.target.value })}
                      style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', cursor: 'pointer', backgroundColor: 'transparent', border: '1px solid rgba(255, 255, 255, 0.2)' }}
                    />
                    <input
                      type="text"
                      value={settings.textColor}
                      onChange={(e) => setSettings({ ...settings, textColor: e.target.value })}
                      style={{ ...textInputStyle, flex: 1 }}
                    />
                  </div>
                </div>

                {/* Fondo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', margin: 0 }}>Fondo</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="color"
                      value={settings.backgroundColor}
                      onChange={(e) => setSettings({ ...settings, backgroundColor: e.target.value })}
                      style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', cursor: 'pointer', backgroundColor: 'transparent', border: '1px solid rgba(255, 255, 255, 0.2)' }}
                    />
                    <div style={{ flex: 1 }}>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={settings.backgroundOpacity || 0.75}
                        onChange={(e) => setSettings({ ...settings, backgroundOpacity: parseFloat(e.target.value) })}
                        style={inputStyle}
                      />
                      <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)', textAlign: 'center', marginTop: '0.25rem' }}>
                        {Math.round((settings.backgroundOpacity || 0.75) * 100)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fuente y Posición en una fila */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                {/* Fuente */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', margin: 0 }}>Fuente</h3>
                  <select
                    value={settings.fontFamily}
                    onChange={(e) => setSettings({ ...settings, fontFamily: e.target.value })}
                    style={selectStyle}
                  >
                    <option value="Arial, sans-serif" style={{ color: 'black', backgroundColor: 'white' }}>Arial</option>
                    <option value="'Courier New', monospace" style={{ color: 'black', backgroundColor: 'white' }}>Courier</option>
                    <option value="Georgia, serif" style={{ color: 'black', backgroundColor: 'white' }}>Georgia</option>
                    <option value="'Times New Roman', serif" style={{ color: 'black', backgroundColor: 'white' }}>Times</option>
                    <option value="Verdana, sans-serif" style={{ color: 'black', backgroundColor: 'white' }}>Verdana</option>
                  </select>
                </div>

                {/* Posición */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', margin: 0 }}>Posición</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.25rem' }}>
                    <button
                      onClick={() => setSettings({ ...settings, position: 'bottom' })}
                      style={{
                        padding: '0.375rem 0.5rem',
                        fontSize: '0.75rem',
                        borderRadius: '0.25rem',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        ...(settings.position === 'bottom'
                          ? { backgroundColor: 'rgb(37, 99, 235)', color: 'white' }
                          : { backgroundColor: 'rgba(255, 255, 255, 0.1)', color: 'rgba(255, 255, 255, 0.7)' })
                      }}
                    >
                      Abajo
                    </button>
                    <button
                      onClick={() => setSettings({ ...settings, position: 'top' })}
                      style={{
                        padding: '0.375rem 0.5rem',
                        fontSize: '0.75rem',
                        borderRadius: '0.25rem',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        ...(settings.position === 'top'
                          ? { backgroundColor: 'rgb(37, 99, 235)', color: 'white' }
                          : { backgroundColor: 'rgba(255, 255, 255, 0.1)', color: 'rgba(255, 255, 255, 0.7)' })
                      }}
                    >
                      Arriba
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'subdivx' ? (
            // Contenido de búsqueda Subdivx
            <div className="space-y-4">
              {/* Controles de búsqueda Subdivx */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white/90">
                  {movieTitle ? `Subtítulos Subdivx para "${movieTitle}"` : 'Búsqueda en Subdivx'}
                </h3>
                <button
                  onClick={searchSubdivxSubtitles}
                  disabled={isSearchingSubdivx || !movieTitle}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-white/10 disabled:text-white/50 text-white text-sm rounded-lg transition-colors duration-200 font-medium"
                >
                  {isSearchingSubdivx ? 'Buscando...' : 'Buscar'}
                </button>
              </div>

              {/* Lista de resultados Subdivx */}
              <div className="max-h-80 overflow-y-auto space-y-2">
                {isSearchingSubdivx ? (
                  <div className="text-center py-8">
                    <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                    <p className="text-white/70 text-sm">Buscando en Subdivx...</p>
                  </div>
                ) : subdivxResults.length > 0 ? (
                  subdivxResults.map((result, index) => (
                    <div
                      key={`${result.downloadUrl}-${index}`}
                      className="bg-white/5 rounded-lg p-3 border border-white/10 hover:bg-white/10 transition-colors duration-200"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-white font-medium text-sm">
                              ES
                            </span>
                            <span className="text-xs bg-green-600 text-white px-1.5 py-0.5 rounded">Subdivx</span>
                          </div>
                          <p className="text-white/70 text-xs truncate mb-1">
                            {result.title}
                          </p>
                          <p className="text-white/50 text-xs truncate mb-1">
                            {result.description}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-white/50">
                            <span>↓ {result.downloads}</span>
                            <span>★ {result.rating}</span>
                            <span>{result.date}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => downloadAndLoadSubdivxSubtitle(result)}
                          disabled={isDownloadingSubdivx}
                          className={`px-3 py-1.5 text-xs rounded-lg transition-colors duration-200 font-medium ${
                            downloadingSubdivxId === result.downloadUrl
                              ? 'bg-yellow-600 text-white'
                              : 'bg-green-600 hover:bg-green-500 text-white'
                          } disabled:opacity-50`}
                        >
                          {downloadingSubdivxId === result.downloadUrl 
                            ? 'Descargando...' 
                            : 'Cargar'
                          }
                        </button>
                      </div>
                    </div>
                  ))
                ) : subdivxResults.length === 0 && !isSearchingSubdivx ? (
                  <div className="text-center py-8">
                    <MagnifyingGlassIcon className="w-12 h-12 text-white/30 mx-auto mb-2" />
                    <p className="text-white/70 text-sm">
                      {movieTitle ? 'No se encontraron subtítulos en Subdivx' : 'Ingresa el título de la película'}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            // Contenido de búsqueda OpenSubtitles (existente)
            <div className="space-y-4">
              {/* Controles de búsqueda OpenSubtitles */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white/90">
                  {movieTitle ? `Subtítulos OpenSubtitles para "${movieTitle}"` : 'Búsqueda en OpenSubtitles'}
                </h3>
                <button
                  onClick={searchSubtitles}
                  disabled={isSearching || !movieTitle}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 disabled:text-white/50 text-white text-sm rounded-lg transition-colors duration-200 font-medium"
                >
                  {isSearching ? 'Buscando...' : 'Buscar'}
                </button>
              </div>

              {/* Filtros */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/70 mb-1 block">Idioma</label>
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white/10 text-white text-sm rounded border border-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    style={{ color: 'white', backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
                  >
                    <option value="all" style={{ color: 'black', backgroundColor: 'white' }}>Todos</option>
                    {availableLanguages.map(lang => (
                      <option key={lang} value={lang} style={{ color: 'black', backgroundColor: 'white' }}>
                        {lang.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/70 mb-1 block">Ordenar por</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'downloads' | 'rating' | 'date')}
                    className="w-full px-2 py-1.5 bg-white/10 text-white text-sm rounded border border-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    style={{ color: 'white', backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
                  >
                    <option value="downloads" style={{ color: 'black', backgroundColor: 'white' }}>Descargas</option>
                    <option value="rating" style={{ color: 'black', backgroundColor: 'white' }}>Rating</option>
                    <option value="date" style={{ color: 'black', backgroundColor: 'white' }}>Fecha</option>
                  </select>
                </div>
              </div>

              {/* Lista de resultados */}
              <div className="max-h-80 overflow-y-auto space-y-2">
                {isSearching ? (
                  <div className="text-center py-8">
                    <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                    <p className="text-white/70 text-sm">Buscando subtítulos...</p>
                  </div>
                ) : filteredAndSortedResults.length > 0 ? (
                  filteredAndSortedResults.map((subtitle) => (
                    <div
                      key={subtitle.id}
                      className="bg-white/5 rounded-lg p-3 border border-white/10 hover:bg-white/10 transition-colors duration-200"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-white font-medium text-sm">
                              {subtitle.attributes.language.toUpperCase()}
                            </span>
                            {subtitle.attributes.hearing_impaired && (
                              <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded">HI</span>
                            )}
                            {subtitle.attributes.from_trusted && (
                              <span className="text-xs bg-green-600 text-white px-1.5 py-0.5 rounded">✓</span>
                            )}
                          </div>
                          <p className="text-white/70 text-xs truncate mb-1">
                            {subtitle.attributes.release}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-white/50">
                            <span>↓ {subtitle.attributes.download_count}</span>
                            <span>★ {subtitle.attributes.ratings}</span>
                            <span>{new Date(subtitle.attributes.upload_date).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => downloadAndLoadSubtitle(subtitle)}
                          disabled={isDownloading || !subtitle.attributes.files || subtitle.attributes.files.length === 0}
                          className={`px-3 py-1.5 text-xs rounded-lg transition-colors duration-200 font-medium ${
                            downloadingId === subtitle.id
                              ? 'bg-yellow-600 text-white'
                              : !subtitle.attributes.files || subtitle.attributes.files.length === 0
                              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-500 text-white'
                          } disabled:opacity-50`}
                        >
                          {downloadingId === subtitle.id 
                            ? 'Descargando...' 
                            : !subtitle.attributes.files || subtitle.attributes.files.length === 0
                            ? 'No disponible'
                            : 'Cargar'
                          }
                        </button>
                      </div>
                    </div>
                  ))
                ) : searchResults.length === 0 && !isSearching ? (
                  <div className="text-center py-8">
                    <MagnifyingGlassIcon className="w-12 h-12 text-white/30 mx-auto mb-2" />
                    <p className="text-white/70 text-sm">
                      {movieTitle ? 'No se encontraron subtítulos en OpenSubtitles' : 'Ingresa el título de la película'}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-white/70 text-sm">No hay resultados con los filtros actuales</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer compacto */}
        <div className="flex items-center justify-between p-4 border-t border-white/10">
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors duration-200 text-sm"
            >
              Reset
            </button>
            <button
              onClick={handleConfirmSubtitles}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors duration-200 text-sm font-medium"
            >
              ✓ Confirmar Sincronización
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-white/70 hover:bg-white/10 rounded-lg transition-colors duration-200 text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors duration-200 text-sm font-medium"
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, targetContainer);
}

export type { SubtitleSettings };

