import { logger } from '@/lib/logger';
interface RealDebridConfig {
  apiKey: string;
  baseUrl?: string;
}

interface TorrentInfo {
  id: string;
  filename: string;
  original_filename: string;
  hash: string;
  bytes: number;
  original_bytes: number;
  host: string;
  split: number;
  progress: number;
  status: 'magnet_error' | 'magnet_conversion' | 'waiting_files_selection' | 'queued' | 'downloading' | 'downloaded' | 'error' | 'virus' | 'compressing' | 'uploading' | 'dead';
  added: string;
  files?: TorrentFile[];
  links?: string[];
  ended?: string;
  speed?: number;
  seeders?: number;
}

interface TorrentFile {
  id: number;
  path: string;
  bytes: number;
  selected: number;
}

interface UnrestrictedLink {
  id: string;
  filename: string;
  mimeType: string;
  filesize: number;
  link: string;
  host: string;
  host_icon: string;
  chunks: number;
  crc: number;
  download: string;
  streamable: number;
}

export class RealDebridClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: RealDebridConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.real-debrid.com/rest/1.0';
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Real-Debrid API Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Añade un magnet link a Real-Debrid
   */
  async addMagnet(magnetUri: string): Promise<{ id: string; uri: string }> {
    const formData = new FormData();
    formData.append('magnet', magnetUri);

    const response = await fetch(`${this.baseUrl}/torrents/addMagnet`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error adding magnet: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Obtiene información de un torrent
   */
  async getTorrentInfo(torrentId: string): Promise<TorrentInfo> {
    return this.makeRequest<TorrentInfo>(`/torrents/info/${torrentId}`);
  }

  /**
   * Selecciona archivos de un torrent para descargar
   */
  async selectFiles(torrentId: string, fileIds: string = 'all'): Promise<void> {
    const formData = new FormData();
    formData.append('files', fileIds);

    await fetch(`${this.baseUrl}/torrents/selectFiles/${torrentId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });
  }

  /**
   * Convierte un link de torrent a link directo
   */
  async unrestrictLink(link: string): Promise<UnrestrictedLink> {
    const formData = new FormData();
    formData.append('link', link);

    const response = await fetch(`${this.baseUrl}/unrestrict/link`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error unrestricting link: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Obtiene todos los torrents del usuario
   */
  async getTorrents(): Promise<TorrentInfo[]> {
    return this.makeRequest<TorrentInfo[]>('/torrents');
  }

  /**
   * Elimina un torrent
   */
  async deleteTorrent(torrentId: string): Promise<void> {
    await this.makeRequest(`/torrents/delete/${torrentId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Proceso completo: magnet -> link directo de streaming
   */
  async magnetToStreamingLink(magnetUri: string): Promise<{
    streamingUrl: string;
    filename: string;
    filesize: number;
    torrentId: string;
  }> {
    try {
      logger.log('🔗 Añadiendo magnet a Real-Debrid...');
      const { id: torrentId } = await this.addMagnet(magnetUri);

      logger.log('⏳ Esperando información del torrent...');
      let torrentInfo: TorrentInfo;
      let attempts = 0;
      const maxAttempts = 30; // 30 segundos máximo

      do {
        await new Promise(resolve => setTimeout(resolve, 750)); // Reducido de 1000ms a 750ms
        torrentInfo = await this.getTorrentInfo(torrentId);
        attempts++;
        
        logger.log(`📊 Estado: ${torrentInfo.status} (${attempts}/${maxAttempts})`);
        
        if (torrentInfo.status === 'magnet_error' || torrentInfo.status === 'error' || torrentInfo.status === 'virus' || torrentInfo.status === 'dead') {
          throw new Error(`Error en el torrent: ${torrentInfo.status}`);
        }
        
      } while (torrentInfo.status !== 'waiting_files_selection' && torrentInfo.status !== 'downloaded' && attempts < maxAttempts);

      if (attempts >= maxAttempts) {
        throw new Error('Timeout esperando información del torrent');
      }

      // Seleccionar el archivo de video más grande
      if (torrentInfo.files && torrentInfo.files.length > 0) {
        const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
        const videoFiles = torrentInfo.files.filter(file => 
          videoExtensions.some(ext => file.path.toLowerCase().endsWith(ext))
        );

        if (videoFiles.length === 0) {
          throw new Error('No se encontraron archivos de video en el torrent');
        }

        // Seleccionar el archivo más grande
        const largestFile = videoFiles.reduce((prev, current) => 
          current.bytes > prev.bytes ? current : prev
        );

        logger.log(`🎬 Seleccionando archivo: ${largestFile.path} (${(largestFile.bytes / 1024 / 1024).toFixed(2)} MB)`);
        await this.selectFiles(torrentId, largestFile.id.toString());

        // Esperar a que se procese
        attempts = 0;
        do {
          await new Promise(resolve => setTimeout(resolve, 1500)); // Reducido de 2000ms a 1500ms
          torrentInfo = await this.getTorrentInfo(torrentId);
          attempts++;
          logger.log(`📥 Procesando: ${torrentInfo.progress}% (${attempts}/${maxAttempts})`);
        } while (torrentInfo.status !== 'downloaded' && attempts < maxAttempts);

        if (torrentInfo.status !== 'downloaded') {
          throw new Error('El torrent no se completó en el tiempo esperado');
        }
      }

      // Obtener el link directo
      if (!torrentInfo.links || torrentInfo.links.length === 0) {
        throw new Error('No se generaron links de descarga');
      }

      logger.log('🔓 Convirtiendo a link directo...');
      const unrestrictedLink = await this.unrestrictLink(torrentInfo.links[0]);

      return {
        streamingUrl: unrestrictedLink.download,
        filename: unrestrictedLink.filename,
        filesize: unrestrictedLink.filesize,
        torrentId: torrentId,
      };

    } catch (error) {
      logger.error('❌ Error en magnetToStreamingLink:', error);
      throw error;
    }
  }

  /**
   * Verifica si la API key es válida
   */
  async validateApiKey(): Promise<boolean> {
    try {
      await this.makeRequest('/user');
      return true;
    } catch {
      return false;
    }
  }
}

export default RealDebridClient;