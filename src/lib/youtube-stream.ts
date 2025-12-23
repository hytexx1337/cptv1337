import { logger } from '@/lib/logger';
import { Innertube } from 'youtubei.js';

export interface YouTubeStreamInfo {
  url: string;
  quality: string;
  format: string;
  hasAudio: boolean;
  hasVideo: boolean;
}

export async function getYouTubeStreamUrl(videoId: string): Promise<YouTubeStreamInfo | null> {
  try {
    logger.log(`🎬 Obteniendo stream para video ID: ${videoId}`);
    
    // Crear instancia de Innertube
    const youtube = await Innertube.create();
    
    // Obtener información del video
    const info = await youtube.getInfo(videoId);
    
    if (!info.basic_info.is_live) {
      // Para videos normales, buscar formatos con video y audio
      const formats = info.streaming_data?.formats || [];
      const adaptiveFormats = info.streaming_data?.adaptive_formats || [];
      
      // Combinar todos los formatos disponibles
      const allFormats = [...formats, ...adaptiveFormats];
      
      if (allFormats.length === 0) {
        logger.error('❌ No se encontraron formatos disponibles para:', videoId);
        return null;
      }

      // Buscar el mejor formato con video y audio
      const videoAndAudioFormats = allFormats.filter(format => 
        format.has_video && format.has_audio && format.url
      );

      let bestFormat;
      
      if (videoAndAudioFormats.length > 0) {
        // Preferir formatos que tengan tanto video como audio
        bestFormat = videoAndAudioFormats.reduce((best, current) => {
          const bestHeight = best.height || 0;
          const currentHeight = current.height || 0;
          return currentHeight > bestHeight ? current : best;
        });
      } else {
        // Si no hay formatos combinados, buscar el mejor formato de video
        const videoFormats = allFormats.filter(format => 
          format.has_video && format.url
        );
        
        if (videoFormats.length === 0) {
          logger.error('❌ No se encontraron formatos de video para:', videoId);
          return null;
        }
        
        bestFormat = videoFormats.reduce((best, current) => {
          const bestHeight = best.height || 0;
          const currentHeight = current.height || 0;
          return currentHeight > bestHeight ? current : best;
        });
      }

      logger.log(`✅ Stream URL obtenida para ${videoId}:`, {
        quality: bestFormat.quality_label || `${bestFormat.height}p`,
        format: bestFormat.mime_type?.split('/')[1]?.split(';')[0] || 'unknown',
        hasAudio: bestFormat.has_audio || false,
        hasVideo: bestFormat.has_video || false,
        itag: bestFormat.itag
      });

      return {
        url: bestFormat.url!,
        quality: bestFormat.quality_label || `${bestFormat.height}p` || 'unknown',
        format: bestFormat.mime_type?.split('/')[1]?.split(';')[0] || 'unknown',
        hasAudio: bestFormat.has_audio || false,
        hasVideo: bestFormat.has_video || false
      };
    } else {
      logger.error('❌ Los streams en vivo no están soportados actualmente');
      return null;
    }

  } catch (error) {
    logger.error('❌ Error al obtener stream de YouTube:', error);
    return null;
  }
}

export async function getYouTubeVideoInfo(videoId: string) {
  try {
    const youtube = await Innertube.create();
    const info = await youtube.getInfo(videoId);
    
    return {
      title: info.basic_info.title || 'Sin título',
      duration: info.basic_info.duration || 0,
      thumbnail: info.basic_info.thumbnail?.[0]?.url,
      description: info.basic_info.short_description || ''
    };
  } catch (error) {
    logger.error('❌ Error al obtener info del video:', error);
    return null;
  }
}