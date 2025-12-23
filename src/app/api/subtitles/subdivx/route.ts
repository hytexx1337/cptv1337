import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { writeFile, unlink, mkdir, readdir, readFile, rm, access, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { extractFull } from 'node-7z';
import * as iconv from 'iconv-lite';

// Función para guardar archivo VTT en disco
async function saveVTTFile(content: string, originalName: string): Promise<string> {
  try {
    const subtitlesDir = join(process.cwd(), 'public', 'subtitles');
    const fileName = `${Date.now()}_${originalName}`;
    const filePath = join(subtitlesDir, fileName);
    
    // Crear directorio si no existe
    await mkdir(subtitlesDir, { recursive: true });
    
    await writeFile(filePath, content, 'utf8');
    
    // Retornar la ruta relativa para el cliente
    return `/subtitles/${fileName}`;
  } catch (error) {
    logger.error('Error saving VTT file:', error);
    throw error;
  }
}

// Función para convertir SRT a VTT
function convertSRTtoVTT(srtContent: string): string {
  try {
    logger.log('[SUBTITLES] Convirtiendo SRT a VTT...');

    let vttContent = 'WEBVTT\n\n';
    const lines = srtContent.split(/\r?\n/);
    const timestampRegex = /^\d{2}:\d{2}:\d{2}[,.:]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.:]\d{3}$/;

    const result: string[] = [];
    let currentSubtitle: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Línea vacía = fin del subtítulo actual
      if (trimmedLine === '') {
        if (currentSubtitle.length > 0) {
          const hasValidTimestamp = currentSubtitle.some(l => timestampRegex.test(l));
          const hasText = currentSubtitle.some(l => 
            !timestampRegex.test(l) && !/^\d+$/.test(l) && l.trim() !== ''
          );

          if (hasValidTimestamp && hasText) {
            result.push(...currentSubtitle);
            result.push('');
          }
          currentSubtitle = [];
        }
        continue;
      }

      // Saltar números de secuencia
      if (/^\d+$/.test(trimmedLine)) {
        continue;
      }

      // Timestamp - convertir comas a puntos
      if (timestampRegex.test(trimmedLine)) {
        const vttTimestamp = trimmedLine.replace(/,/g, '.');
        currentSubtitle.push(vttTimestamp);
        continue;
      }

      // Texto del subtítulo
      if (trimmedLine.length > 0) {
        currentSubtitle.push(trimmedLine);
      }
    }

    // Procesar último subtítulo
    if (currentSubtitle.length > 0) {
      const hasValidTimestamp = currentSubtitle.some(l => timestampRegex.test(l));
      const hasText = currentSubtitle.some(l => 
        !timestampRegex.test(l) && !/^\d+$/.test(l) && l.trim() !== ''
      );

      if (hasValidTimestamp && hasText) {
        result.push(...currentSubtitle);
      }
    }

    vttContent += result.join('\n');

    logger.log('✅ Conversión SRT→VTT exitosa');
    return vttContent;

  } catch (error) {
    logger.error('❌ [SUBTITLES] Error en conversión:', error);
    return 'WEBVTT\n\n';
  }
}

/**
 * Detecta la codificación de un buffer y lo convierte a UTF-8
 */
function detectEncodingAndConvert(buffer: Buffer): string {
  try {
    // Intentar detectar la codificación basándose en el contenido
    const sample = buffer.slice(0, Math.min(1024, buffer.length));
    
    // Buscar BOM (Byte Order Mark)
    if (sample[0] === 0xEF && sample[1] === 0xBB && sample[2] === 0xBF) {
      logger.log('🔍 [ENCODING] Detectado UTF-8 con BOM');
      return buffer.slice(3).toString('utf8');
    }
    
    // Intentar UTF-8 primero
    try {
      const utf8Content = buffer.toString('utf8');
      // Verificar si hay caracteres de reemplazo (�) que indican codificación incorrecta
      if (!utf8Content.includes('�') && isValidUTF8(buffer)) {
        logger.log('🔍 [ENCODING] Detectado UTF-8 válido');
        return utf8Content;
      }
    } catch (e) {
      // UTF-8 falló, continuar con otras codificaciones
    }
    
    // Intentar Latin-1 (ISO-8859-1) - común en subtítulos españoles
    try {
      if (iconv.encodingExists('latin1')) {
        const latin1Content = iconv.decode(buffer, 'latin1');
        logger.log('🔍 [ENCODING] Usando Latin-1 (ISO-8859-1)');
        return latin1Content;
      }
    } catch (e) {
      logger.warn('⚠️ [ENCODING] Error con Latin-1:', e);
    }
    
    // Intentar Windows-1252 - otra codificación común
    try {
      if (iconv.encodingExists('windows-1252')) {
        const windows1252Content = iconv.decode(buffer, 'windows-1252');
        logger.log('🔍 [ENCODING] Usando Windows-1252');
        return windows1252Content;
      }
    } catch (e) {
      logger.warn('⚠️ [ENCODING] Error con Windows-1252:', e);
    }
    
    // Como último recurso, usar UTF-8
    logger.log('⚠️ [ENCODING] Usando UTF-8 como fallback');
    return buffer.toString('utf8');
    
  } catch (error) {
    logger.error('❌ [ENCODING] Error detectando codificación:', error);
    return buffer.toString('utf8');
  }
}

/**
 * Verifica si un buffer contiene UTF-8 válido
 */
function isValidUTF8(buffer: Buffer): boolean {
  try {
    const str = buffer.toString('utf8');
    return Buffer.from(str, 'utf8').equals(buffer);
  } catch {
    return false;
  }
}

/**
 * Lee un archivo con detección automática de codificación
 */
async function readFileWithEncoding(filePath: string): Promise<string> {
  try {
    const buffer = await readFile(filePath);
    return detectEncodingAndConvert(buffer);
  } catch (error) {
    logger.error('❌ [ENCODING] Error leyendo archivo:', error);
    throw error;
  }
}

// Configurar la ruta del ejecutable 7z según el sistema operativo
const sevenZipPath = process.platform === 'win32' 
  ? 'C:\\Program Files\\7-Zip\\7z.exe'
  : '7z'; // Linux/macOS - asume que 7z está en PATH

// Función para detectar el tipo de archivo por magic bytes
function detectArchiveType(buffer: Buffer): string {
  // Verificar si es un archivo SRT directo
  const text = buffer.toString('utf8', 0, Math.min(buffer.length, 1000));
  if (text.match(/^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/)) {
    return 'srt';
  }
  
  // ZIP: PK (0x504B)
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    return 'zip';
  }
  
  // RAR: Rar! (0x526172211A0700)
  if (buffer[0] === 0x52 && buffer[1] === 0x61 && buffer[2] === 0x72 && buffer[3] === 0x21) {
    return 'rar';
  }
  
  // 7z: 7z¼¯' (0x377ABCAF271C)
  if (buffer[0] === 0x37 && buffer[1] === 0x7A && buffer[2] === 0xBC && buffer[3] === 0xAF) {
    return '7z';
  }
  
  // Por defecto, asumir ZIP si no se puede detectar
  return 'zip';
}

interface SubdivxResult {
  title: string;
  description: string;
  downloadUrl: string;
  rating: number;
  downloads: number;
  date: string;
}

interface SubtitleFile {
  name: string;
  content: string;
  filePath?: string;
  language: string;
  size?: number;
  type?: string;
  originalName?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || searchParams.get('q');
    const year = searchParams.get('year');
    const autoDownload = searchParams.get('autoDownload') === 'true';

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' }, 
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      );
    }

    // Buscar subtítulos en Subdivx
    const results = await searchSubdivx(query, year);

    if (autoDownload && results.length > 0) {
      // Descargar y descomprimir el primer resultado automáticamente
      const subtitleFiles = await downloadAndExtractSubtitle(results[0]);
      return NextResponse.json({
        results,
        subtitleFiles,
        autoDownloaded: true
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    return NextResponse.json({ results }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  } catch (error) {
    logger.error('Error searching Subdivx:', error);
    return NextResponse.json(
      { error: 'Failed to search subtitles' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { downloadUrl } = await request.json();

    if (!downloadUrl) {
      return NextResponse.json(
        { error: 'Download URL is required' }, 
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      );
    }

    const subtitleFiles = await downloadAndExtractSubtitle({ downloadUrl } as SubdivxResult);
    
    return NextResponse.json({ subtitleFiles }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  } catch (error) {
    logger.error('Error downloading subtitle:', error);
    return NextResponse.json(
      { error: 'Failed to download subtitle' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      }
    );
  }
}

// Agregar método OPTIONS para manejar preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function searchSubdivx(query: string, year?: string | null): Promise<SubdivxResult[]> {
  const searchQuery = year ? `${query} ${year}` : query;
  
  try {
    logger.log('Searching subtitles using SubX API for:', searchQuery);
    
    const subxApiUrl = 'https://subx-api.duckdns.org/api/subtitles/search';
    const token = 'k2hZYIx9_k2hZYIx99HoIwRp2G6MZSKOq83bzkph4bW0CTxIAgPM';
    
    const searchParams = new URLSearchParams({
      query: searchQuery
    });
    
    const response = await fetch(`${subxApiUrl}?${searchParams}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'Movie-Catalog-SubdivX/1.0.0'
      },
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(15000) // 15 seconds timeout
    });
    
    if (!response.ok) {
      throw new Error(`SubX API error: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    logger.log('SubX API Response:', JSON.stringify(data, null, 2));
    
    // Convert SubX API response to our format
    if (data && data.items && Array.isArray(data.items)) {
      const results = data.items.map((item: any) => ({
        title: item.title || 'Sin título',
        description: item.description || '',
        uploader: item.uploader_name || 'Desconocido',
        downloads: item.downloads || 0,
        downloadUrl: `https://subx-api.duckdns.org/api/subtitles/${item.id}/download`,
        rating: (item.downloads || 0) / 100, // Convert downloads to rating
        date: item.posted_at || '',
        id: item.id.toString(),
        apiSource: 'subx-api',
        videoType: item.video_type,
        season: item.season,
        episode: item.episode,
        imdbId: item.imdb_id,
        postedAt: item.posted_at
      }));
      
      logger.log(`SubX API succeeded with ${results.length} results!`);
      return results.sort((a: SubdivxResult, b: SubdivxResult) => b.downloads - a.downloads);
    }
    
    logger.log('SubX API: No items found or invalid response structure');
    return [];
    
  } catch (error: any) {
    logger.error('Error searching SubdivX via SubX API:', error);
    throw new Error(`Failed to search subtitles: ${error.message}`);
  }
}

async function downloadAndExtractSubtitle(result: SubdivxResult): Promise<SubtitleFile[]> {
  try {
    logger.log('Downloading subtitle from SubX API:', result.downloadUrl);
    
    // Direct download from SubX API using GET method
    const downloadResponse = await fetch(result.downloadUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer k2hZYIx9_k2hZYIx99HoIwRp2G6MZSKOq83bzkph4bW0CTxIAgPM',
        'Accept': '*/*',
        'User-Agent': 'Movie-Catalog-SubdivX/1.0.0',
      },
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(30000) // 30 seconds timeout for downloads
    });

    if (!downloadResponse.ok) {
      throw new Error(`Download failed: ${downloadResponse.status} - ${downloadResponse.statusText}`);
    }

    const buffer = Buffer.from(await downloadResponse.arrayBuffer());
    logger.log('Downloaded file size:', buffer.length, 'bytes');

    if (buffer.length === 0) {
      throw new Error('Downloaded file is empty');
    }

    // Detect archive type
    const archiveType = detectArchiveType(buffer);
    logger.log('Detected archive type:', archiveType);

    // Create or use existing subdivx-subtitles directory
    const baseSubtitleDir = '/tmp/subdivx-subtitles';
    const tempDir = join(baseSubtitleDir, `subtitle-${Date.now()}`);
    
    // Ensure the base directory exists
    await mkdir(baseSubtitleDir, { recursive: true });
    await mkdir(tempDir, { recursive: true });

    // Create temporary file path
    const tempFilePath = join(tempDir, `subtitle.${archiveType}`);
    
    // Write buffer to temporary file
    await writeFile(tempFilePath, buffer);
    logger.log(`Wrote ${buffer.length} bytes to ${tempFilePath}`);
    
    // Verify file exists and has correct size
    try {
      const stats = await access(tempFilePath);
      logger.log(`File verified: ${tempFilePath}`);
    } catch (accessError) {
      logger.error(`File verification failed: ${tempFilePath}`, accessError);
      throw new Error(`Failed to create temporary file: ${tempFilePath}`);
    }

    const subtitleFiles: SubtitleFile[] = [];
    
    logger.log(`Using subtitle directory: ${tempDir}`);

    try {

      if (archiveType === 'zip') {
        // Extract ZIP using AdmZip
        const zip = new AdmZip(tempFilePath);
        const zipEntries = zip.getEntries();
        
        // Crear array temporal para ordenar por tamaño
        const zipSubtitleFilesWithSize: Array<{
          entry: any;
          extractPath: string;
          size: number;
          content: string;
        }> = [];
        
        // Primero extraer y leer todos los archivos SRT
        for (const entry of zipEntries) {
          if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.srt')) {
            const extractPath = join(tempDir, entry.entryName);
            await mkdir(join(extractPath, '..'), { recursive: true });
            await writeFile(extractPath, entry.getData());
            
            try {
              const content = await readFileWithEncoding(extractPath);
              const size = entry.header.size || Buffer.byteLength(content, 'utf8');
              
              zipSubtitleFilesWithSize.push({
                entry,
                extractPath,
                size,
                content
              });
              
              logger.log(`Found ZIP subtitle file: ${entry.entryName} (${size} bytes)`);
            } catch (readError) {
              logger.warn(`Failed to read ZIP subtitle file ${entry.entryName}:`, readError);
            }
          }
        }
        
        // Ordenar por tamaño (más grande primero)
        zipSubtitleFilesWithSize.sort((a, b) => b.size - a.size);
        
        logger.log(`Processing ${zipSubtitleFilesWithSize.length} ZIP subtitle files in order of size:`);
        zipSubtitleFilesWithSize.forEach((item, index) => {
          logger.log(`  ${index + 1}. ${item.entry.entryName} - ${item.size} bytes`);
        });
        
        // Procesar archivos ordenados por tamaño
        for (const item of zipSubtitleFilesWithSize) {
          try {
            // Convert SRT to VTT
            logger.log(`Converting SRT to VTT: ${item.entry.entryName}`);
            const vttContent = convertSRTtoVTT(item.content);
            
            // Determinar el tipo de subtítulo basado en el nombre del archivo
            let subtitleType = 'normal';
            let language = 'es';
            
            if (item.entry.entryName.toLowerCase().includes('forced') || item.entry.entryName.toLowerCase().includes('forzado')) {
              subtitleType = 'forced';
            }
            
            // Crear nombre descriptivo que incluya el tamaño y tipo
            const baseName = item.entry.entryName.replace(/\.srt$/i, '');
            const vttFileName = `${baseName}_${item.size}bytes.vtt`;
            
            // Save VTT file
            const savedFilePath = await saveVTTFile(vttContent, vttFileName);
            
            subtitleFiles.push({
              name: vttFileName,
              content: vttContent,
              filePath: savedFilePath,
              language: language,
              size: item.size,
              type: subtitleType,
              originalName: item.entry.entryName
            });
            
            logger.log(`✅ Successfully processed ZIP subtitle file: ${item.entry.entryName} -> ${vttFileName} (${item.size} bytes, ${subtitleType})`);
          } catch (processError) {
            logger.warn(`Failed to process ZIP subtitle file ${item.entry.entryName}:`, processError);
          }
        }
      } else if (archiveType === 'rar' || archiveType === '7z') {
        // Extract RAR/7Z using 7-Zip
        try {
          logger.log(`Attempting to extract ${archiveType} file: ${tempFilePath}`);
          
          // Crear directorio de extracción
          const extractDir = join(tempDir, 'extracted');
          await mkdir(extractDir, { recursive: true });
          
          // Verificar que el archivo existe antes de extraer
          const fileExists = await readFile(tempFilePath).then(() => true).catch(() => false);
          logger.log('File exists:', fileExists);
          
          const extractionStream = extractFull(tempFilePath, extractDir, {
            $bin: sevenZipPath
          });
          
          // Esperar a que la extracción termine
          await new Promise((resolve, reject) => {
            extractionStream.on('end', resolve);
            extractionStream.on('error', reject);
          });
          
          logger.log('Extraction completed successfully');
          
          // Buscar archivos de subtítulos en el directorio extraído
          const extractedFilesList = await readdir(extractDir, { recursive: true });
          logger.log('Extracted files:', extractedFilesList);
          
          // Crear array temporal para ordenar por tamaño
          const subtitleFilesWithSize: Array<{
            file: string;
            path: string;
            size: number;
            content: string;
          }> = [];

          for (const file of extractedFilesList) {
            if (typeof file === 'string' && file.match(/\.(srt|ass|ssa|vtt|sub)$/i)) {
              const extractedFilePath = join(extractDir, file);
              try {
                const content = await readFileWithEncoding(extractedFilePath);
                const stats = await stat(extractedFilePath);
                
                subtitleFilesWithSize.push({
                  file,
                  path: extractedFilePath,
                  size: stats.size,
                  content
                });
                
                logger.log(`Found subtitle file: ${file} (${stats.size} bytes)`);
              } catch (readError) {
                logger.warn(`Failed to read subtitle file ${file}:`, readError);
              }
            }
          }

          // Ordenar por tamaño (más grande primero)
          subtitleFilesWithSize.sort((a, b) => b.size - a.size);
          
          logger.log(`Processing ${subtitleFilesWithSize.length} subtitle files in order of size:`);
          subtitleFilesWithSize.forEach((item, index) => {
            logger.log(`  ${index + 1}. ${item.file} - ${item.size} bytes`);
          });

          // Procesar archivos ordenados por tamaño
          for (const item of subtitleFilesWithSize) {
            try {
              // Convertir SRT a VTT si es necesario
              let processedContent = item.content;
              if (item.file.match(/\.srt$/i)) {
                logger.log(`Converting SRT to VTT: ${item.file}`);
                processedContent = convertSRTtoVTT(item.content);
              }
              
              // Determinar el tipo de subtítulo basado en el nombre del archivo
              let subtitleType = 'normal';
              let language = 'es';
              
              if (item.file.toLowerCase().includes('forced') || item.file.toLowerCase().includes('forzado')) {
                subtitleType = 'forced';
              }
              
              // Crear nombre descriptivo que incluya el tamaño y tipo
              const baseName = item.file.replace(/\.(srt|ass|ssa|vtt|sub)$/i, '');
              const vttFileName = `${baseName}_${item.size}bytes.vtt`;
              
              // Guardar archivo VTT en disco
              const savedFilePath = await saveVTTFile(processedContent, vttFileName);
              
              subtitleFiles.push({
                name: vttFileName,
                content: processedContent,
                filePath: savedFilePath,
                language: language,
                size: item.size,
                type: subtitleType,
                originalName: item.file
              });
              
              logger.log(`✅ Successfully processed subtitle file: ${item.file} -> ${vttFileName} (${item.size} bytes, ${subtitleType})`);
            } catch (processError) {
              logger.warn(`Failed to process subtitle file ${item.file}:`, processError);
            }
          }
          
          // Limpiar directorio extraído
          // await rm(extractDir, { recursive: true, force: true });
        } catch (rarError) {
          logger.error('RAR extraction error:', rarError);
          // No eliminar el archivo aquí para debugging
          // await rm(extractDir, { recursive: true, force: true });
          throw new Error(`Failed to extract RAR file: ${rarError instanceof Error ? rarError.message : 'Unknown error'}`);
        }
      } else {
        // Assume it's a direct SRT file
        const srtPath = join(tempDir, 'subtitle.srt');
        await writeFile(srtPath, buffer);
        
        const content = await readFileWithEncoding(srtPath);
        const vttContent = convertSRTtoVTT(content);
        const savedPath = await saveVTTFile(vttContent, 'subtitle.vtt');
        
        subtitleFiles.push({
          name: 'subtitle.vtt',
          content: vttContent,
          filePath: savedPath,
          language: 'es'
        });
      }

      if (subtitleFiles.length === 0) {
        throw new Error('No SRT files found in the downloaded archive');
      }

      return subtitleFiles;
      
    } finally {
      // Clean up temporary directory
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        logger.warn('Failed to clean up temp directory:', cleanupError);
      }
    }
    
  } catch (error: any) {
    logger.error('Error downloading and extracting subtitle:', error);
    throw new Error(`Failed to download subtitle: ${error.message}`);
  }
}