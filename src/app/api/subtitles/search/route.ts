import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

// Importar el scraper de Subscene
const subscene_scraper = require('subscene_scraper');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const movieTitle = searchParams.get('title');
    const language = searchParams.get('language') || 'spanish';
    
    if (!movieTitle) {
      return NextResponse.json(
        { error: 'El parámetro title es requerido' },
        { status: 400 }
      );
    }

    logger.log(`🔍 Buscando subtítulos para: "${movieTitle}" en idioma: ${language}`);

    // Usar el scraper pasivo de Subscene
    const subtitles = await new Promise((resolve, reject) => {
      const interactiveDownloader = subscene_scraper.interactiveDownloader(movieTitle, language, null);
      
      let searchResults = [];
      
      interactiveDownloader.on('info', async (info: any, choose: any) => {
        if (info.type === 'title') {
          // Devolver los resultados de búsqueda sin descargar
          searchResults = info.result.map((item: any, index: number) => ({
            id: index,
            title: item.title || item.name,
            year: item.year,
            url: item.url,
            type: item.type || 'movie'
          }));
          resolve(searchResults);
        } else if (info.type === 'release') {
          // Devolver las opciones de release
          const releases = info.result.map((item: any, index: number) => ({
            id: index,
            name: item.name || item.title,
            url: item.url,
            uploader: item.uploader,
            comment: item.comment,
            downloads: item.downloads
          }));
          resolve(releases);
        }
      });

      interactiveDownloader.on('error', (error: any) => {
        logger.error('❌ Error en scraper:', error);
        reject(error);
      });

      // Timeout de 30 segundos
      setTimeout(() => {
        reject(new Error('Timeout: La búsqueda tardó demasiado'));
      }, 30000);
    });

    return NextResponse.json({
      query: movieTitle,
      language,
      results: subtitles,
      source: 'subscene'
    });

  } catch (error) {
    logger.error('❌ Error buscando subtítulos:', error);
    return NextResponse.json(
      { 
        error: 'Error al buscar subtítulos',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}