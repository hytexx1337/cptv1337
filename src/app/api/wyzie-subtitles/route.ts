import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Endpoint para buscar y descargar subtítulos usando Wyzie API
 * GET /api/wyzie-subtitles?tmdbId=123&language=es&season=1&episode=1
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tmdbId = searchParams.get('tmdbId');
    const imdbId = searchParams.get('imdbId');
    const language = searchParams.get('language') || 'es';
    const season = searchParams.get('season');
    const episode = searchParams.get('episode');
    const format = searchParams.get('format') || 'srt';
    const source = searchParams.get('source'); // opensubtitles, subdivx, etc.

    // Validar que tengamos al menos un ID
    if (!tmdbId && !imdbId) {
      return NextResponse.json(
        { error: 'Se requiere tmdbId o imdbId' },
        { status: 400 }
      );
    }

    console.log('🔍 [WYZIE] Buscando subtítulos:', {
      tmdbId,
      imdbId,
      language,
      season,
      episode,
      format,
    });

    // Construir URL de Wyzie
    const wyzieParams = new URLSearchParams();
    
    // Wyzie usa 'id' para ambos TMDB e IMDB
    // Para TMDB: usar el ID directamente
    // Para IMDB: usar con prefijo 'tt'
    if (tmdbId) {
      wyzieParams.append('id', tmdbId);
    } else if (imdbId) {
      // Asegurarse de que el IMDB ID tenga el prefijo 'tt'
      const imdbWithPrefix = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
      wyzieParams.append('id', imdbWithPrefix);
    }
    
    // Solo agregar season y episode si son para series
    if (season) {
      wyzieParams.append('season', season);
    }
    if (episode) {
      wyzieParams.append('episode', episode);
    }
    
    // Filtrar por fuente si se especifica (opensubtitles, subdivx, etc.)
    // Cuando se filtra por source, NO enviar language (Wyzie retorna todos los idiomas)
    if (source) {
      wyzieParams.append('source', source);
    } else {
      // Solo agregar language si NO hay source especificado
      wyzieParams.append('language', language);
    }

    const wyzieUrl = `https://sub.wyzie.ru/search?${wyzieParams.toString()}`;
    console.log('📡 [WYZIE] URL completa:', wyzieUrl);
    console.log('📋 [WYZIE] Parámetros:', {
      id: tmdbId || imdbId,
      language,
      season,
      episode,
    });

    // Hacer request a Wyzie
    const wyzieResponse = await fetch(wyzieUrl, {
      headers: {
        'User-Agent': 'CineParaTodosTV/1.0',
      },
    });

    if (!wyzieResponse.ok) {
      const errorText = await wyzieResponse.text();
      console.error('❌ [WYZIE] Error HTTP:', wyzieResponse.status);
      console.error('❌ [WYZIE] Error body:', errorText);
      console.error('❌ [WYZIE] URL que causó el error:', wyzieUrl);
      
      return NextResponse.json(
        { 
          error: `Wyzie API error: ${wyzieResponse.status}`,
          details: errorText,
          url: wyzieUrl 
        },
        { status: wyzieResponse.status }
      );
    }

    const contentType = wyzieResponse.headers.get('content-type');
    console.log('📦 [WYZIE] Content-Type:', contentType);

    // Wyzie puede retornar JSON con resultados o directamente el subtítulo
    if (contentType?.includes('application/json')) {
      // Lista de subtítulos disponibles - descargar el primero
      const data = await wyzieResponse.json();
      console.log('✅ [WYZIE] JSON recibido:', JSON.stringify(data).substring(0, 300));
      console.log('🔍 [WYZIE] Tipo de respuesta:', typeof data);
      console.log('🔍 [WYZIE] ¿Es array?:', Array.isArray(data));
      
      // Wyzie puede retornar directamente un array o un objeto con {success, subtitles}
      let subtitles = [];
      
      if (Array.isArray(data)) {
        // Respuesta directa como array
        subtitles = data;
        console.log('📋 [WYZIE] Respuesta es array directo');
      } else if (data.success && data.subtitles) {
        // Respuesta con formato {success: true, subtitles: [...]}
        subtitles = data.subtitles;
        console.log('📋 [WYZIE] Respuesta es objeto con success');
      } else if (data.subtitles) {
        // Respuesta con solo {subtitles: [...]}
        subtitles = data.subtitles;
        console.log('📋 [WYZIE] Respuesta es objeto con subtitles');
      }
      
      // Verificar si hay subtítulos
      if (subtitles && subtitles.length > 0) {
        console.log(`📋 [WYZIE] ${subtitles.length} subtítulos disponibles`);
        
        // Si se especificó source, retornar la lista completa sin descargar
        // El frontend descargará el que el usuario elija
        if (source) {
          console.log(`📋 [WYZIE] Retornando lista completa (source=${source})`);
          return NextResponse.json({
            success: true,
            count: subtitles.length,
            subtitles: subtitles.map((sub: any) => ({
              id: sub.id,
              url: sub.url,
              language: sub.language,
              display: sub.display,
              media: sub.media,
              format: sub.format,
              encoding: sub.encoding,
              isHearingImpaired: sub.isHearingImpaired,
            })),
          });
        }
        
        // Sin source: descargar los primeros 2 para carga automática
        const subtitlesToProcess = subtitles.slice(0, 2);
        console.log(`📥 [WYZIE] Procesando ${subtitlesToProcess.length} subtítulos`);
        
        // Descargar y convertir todos los subtítulos
        const processedSubtitles = [];
        
        for (let idx = 0; idx < subtitlesToProcess.length; idx++) {
          const subtitle = subtitlesToProcess[idx];
          const subtitleUrl = subtitle.url;
          const encoding = subtitle.encoding || 'UTF-8';
          
          console.log(`⬇️ [WYZIE] [${idx + 1}/${subtitlesToProcess.length}] Descargando desde:`, subtitleUrl);
          console.log(`🔤 [WYZIE] Encoding declarado: ${encoding}`);
          
          try {
            // Descargar el subtítulo
            const subtitleResponse = await fetch(subtitleUrl, {
              headers: {
                'User-Agent': 'CineParaTodosTV/1.0',
              },
            });
            
            if (!subtitleResponse.ok) {
              console.error(`❌ [WYZIE] Error descargando subtítulo ${idx + 1}:`, subtitleResponse.status);
              continue;
            }
            
            // Obtener el contenido
            // IMPORTANTE: Wyzie declara encoding CP1252 pero envía UTF-8
            // Siempre leer como UTF-8 sin importar el encoding declarado
            const buffer = await subtitleResponse.arrayBuffer();
            const bufferNode = Buffer.from(buffer);
            
            console.log(`📝 [WYZIE] Encoding declarado: ${encoding} (ignorando, usando UTF-8)`);
            const subtitleContent = bufferNode.toString('utf-8');
            console.log(`✅ [WYZIE] Decodificado como UTF-8`);
            
            console.log(`✅ [WYZIE] Subtítulo ${idx + 1} descargado, tamaño:`, subtitleContent.length);
            console.log(`📝 [WYZIE] Primeras 100 caracteres:`, subtitleContent.substring(0, 100));
            
            // Detectar formato del subtítulo
            const contentTrimmed = subtitleContent.trim();
            const isVtt = contentTrimmed.startsWith('WEBVTT');
            const isAss = contentTrimmed.startsWith('[Script Info]') || contentTrimmed.includes('[V4+ Styles]') || contentTrimmed.includes('Format: Layer');
            const isSrt = !isVtt && !isAss;
            
            let vttContent = subtitleContent;
            let format = 'vtt';
            
            if (isAss) {
              // 🎨 NO convertir ASS/SSA, mantener formato original para renderizado con assjs
              console.log(`🎨 [WYZIE] Subtítulo ${idx + 1} es ASS/SSA - guardando formato original`);
              format = 'ass';
              vttContent = subtitleContent; // Mantener contenido ASS original
            } else if (isSrt) {
              console.log(`🔄 [WYZIE] Convirtiendo subtítulo ${idx + 1} de SRT a VTT...`);
              vttContent = convertSrtToVtt(subtitleContent);
              console.log(`✅ [WYZIE] Subtítulo ${idx + 1} convertido de SRT a VTT, tamaño:`, vttContent.length);
              format = 'vtt';
            } else {
              format = 'vtt';
            }
            
            processedSubtitles.push({
              index: idx,
              language: subtitle.language || language,
              display: subtitle.display || subtitle.language || language,
              media: subtitle.media || 'Unknown',
              encoding: encoding,
              vtt: vttContent,
              format: format, // Añadir información del formato
              isASS: isAss, // Flag para identificar ASS
            });
          } catch (error: any) {
            console.error(`❌ [WYZIE] Error procesando subtítulo ${idx + 1}:`, error.message);
          }
        }
        
        if (processedSubtitles.length === 0) {
          console.error('❌ [WYZIE] No se pudo procesar ningún subtítulo');
          return NextResponse.json(
            { error: 'Error procesando subtítulos' },
            { status: 500 }
          );
        }
        
        // Retornar lista de subtítulos procesados
        return NextResponse.json({
          success: true,
          count: processedSubtitles.length,
          subtitles: processedSubtitles,
        });
      } else {
        // No hay subtítulos disponibles
        console.log('⚠️ [WYZIE] No se encontraron subtítulos en la respuesta');
        return NextResponse.json(
          { error: 'No se encontraron subtítulos' },
          { status: 404 }
        );
      }
    } else {
      // Subtítulo directo (SRT/VTT)
      const subtitleContent = await wyzieResponse.text();
      console.log('✅ [WYZIE] Subtítulo descargado, tamaño:', subtitleContent.length);
      console.log('📝 [WYZIE] Primeras 100 caracteres:', subtitleContent.substring(0, 100));

      // SIEMPRE convertir a VTT si no lo es ya
      let vttContent = subtitleContent;
      
      // Verificar si ya es VTT
      const isVtt = subtitleContent.trim().startsWith('WEBVTT');
      
      if (!isVtt) {
        console.log('🔄 [WYZIE] Contenido no es VTT, convirtiendo desde SRT...');
        vttContent = convertSrtToVtt(subtitleContent);
        console.log('✅ [WYZIE] Convertido a VTT, tamaño:', vttContent.length);
        console.log('📝 [WYZIE] VTT primeras 200 caracteres:', vttContent.substring(0, 200));
      } else {
        console.log('✅ [WYZIE] Ya es formato VTT');
      }

      // Retornar el subtítulo directamente
      return new NextResponse(vttContent, {
        headers: {
          'Content-Type': 'text/vtt; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }
  } catch (error: any) {
    console.error('❌ [WYZIE] Error:', error);
    return NextResponse.json(
      { error: 'Error obteniendo subtítulos', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Convierte subtítulos ASS/SSA a formato VTT
 */
function convertAssToVtt(ass: string): string {
  console.log('🔧 [CONVERT] Iniciando conversión ASS/SSA a VTT...');
  
  let vtt = 'WEBVTT\n\n';
  
  // Normalizar saltos de línea
  const normalized = ass.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  
  // Buscar la sección [Events]
  let inEvents = false;
  let dialogueFormat: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detectar sección [Events]
    if (line === '[Events]') {
      inEvents = true;
      continue;
    }
    
    // Salir si llegamos a otra sección
    if (line.startsWith('[') && line !== '[Events]') {
      inEvents = false;
      continue;
    }
    
    // Parsear formato de diálogo
    if (inEvents && line.startsWith('Format:')) {
      dialogueFormat = line.substring(7).split(',').map(s => s.trim());
      continue;
    }
    
    // Parsear líneas de diálogo
    if (inEvents && line.startsWith('Dialogue:')) {
      const parts = line.substring(9).split(',');
      
      // Encontrar índices de Start, End, y Text
      const startIdx = dialogueFormat.indexOf('Start');
      const endIdx = dialogueFormat.indexOf('End');
      const textIdx = dialogueFormat.indexOf('Text');
      
      if (startIdx >= 0 && endIdx >= 0 && textIdx >= 0) {
        const start = parts[startIdx]?.trim();
        const end = parts[endIdx]?.trim();
        const text = parts.slice(textIdx).join(',').trim();
        
        // Convertir timestamp ASS (0:00:00.00) a VTT (00:00:00.000)
        const convertTime = (time: string) => {
          const match = time.match(/(\d+):(\d+):(\d+)\.(\d+)/);
          if (match) {
            const h = match[1].padStart(2, '0');
            const m = match[2].padStart(2, '0');
            const s = match[3].padStart(2, '0');
            const ms = match[4].padStart(3, '0').substring(0, 3);
            return `${h}:${m}:${s}.${ms}`;
          }
          return time;
        };
        
        // Limpiar texto de tags ASS ({\tag})
        const cleanText = text.replace(/\{[^}]+\}/g, '').replace(/\\N/g, '\n');
        
        if (start && end && cleanText) {
          vtt += `${convertTime(start)} --> ${convertTime(end)}\n`;
          vtt += `${cleanText}\n\n`;
        }
      }
    }
  }
  
  console.log('✅ [CONVERT] Conversión ASS/SSA completada');
  return vtt;
}

/**
 * Convierte subtítulos SRT a formato VTT
 */
function convertSrtToVtt(srt: string): string {
  console.log('🔧 [CONVERT] Iniciando conversión SRT a VTT...');
  
  // Agregar header VTT
  let vtt = 'WEBVTT\n\n';
  
  // Normalizar saltos de línea
  const normalizedSrt = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedSrt.split('\n');
  
  let skipNextEmpty = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Saltar líneas vacías después de números de secuencia
    if (skipNextEmpty && line === '') {
      skipNextEmpty = false;
      continue;
    }
    
    // Detectar número de secuencia (solo números)
    if (/^\d+$/.test(line)) {
      // Saltar números de secuencia (no necesarios en VTT)
      skipNextEmpty = true;
      continue;
    }
    
    // Detectar línea de timestamp (formato: 00:00:00,000 --> 00:00:00,000)
    if (line.includes('-->')) {
      // Reemplazar comas por puntos en timestamps
      const vttTimestamp = line.replace(/,(\d{3})/g, '.$1');
      vtt += vttTimestamp + '\n';
    } else {
      // Agregar línea de texto o línea vacía
      vtt += line + '\n';
    }
  }
  
  console.log('✅ [CONVERT] Conversión completada');
  return vtt;
}

