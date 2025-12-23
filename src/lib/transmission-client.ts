import { logger } from './logger';

export interface TransmissionTorrent {
  id: number;
  name: string;
  status: number;
  percentDone: number;
  downloadDir: string;
  files: TransmissionFile[];
  peers: number;
  downloadedEver: number;
  uploadedEver: number;
  rateDownload: number;
  rateUpload: number;
  eta: number;
  hashString: string;
  magnetLink?: string;
}

export interface TransmissionFile {
  name: string;
  length: number;
  bytesCompleted: number;
  wanted: boolean;
  priority: number;
}

export interface TransmissionStats {
  activeTorrentCount: number;
  downloadSpeed: number;
  uploadSpeed: number;
  pausedTorrentCount: number;
  torrentCount: number;
}

export interface TransmissionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  ssl?: boolean;
}

export class TransmissionClient {
  private config: TransmissionConfig;
  private sessionId: string | null = null;
  private baseUrl: string;

  constructor(config: TransmissionConfig) {
    this.config = {
      host: 'localhost',
      port: 9091,
      ssl: false,
      ...config
    };
    
    const protocol = this.config.ssl ? 'https' : 'http';
    this.baseUrl = `${protocol}://${this.config.host}:${this.config.port}/transmission/rpc`;
  }

  /**
   * Make RPC request to Transmission daemon
   */
  private async makeRequest(method: string, arguments_?: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add session ID if we have one
    if (this.sessionId) {
      headers['X-Transmission-Session-Id'] = this.sessionId;
    }

    // Add basic auth if configured
    if (this.config.username && this.config.password) {
      const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const body = JSON.stringify({
      method,
      arguments: arguments_ || {},
    });

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body,
      });

      // Handle session ID requirement (409 Conflict)
      if (response.status === 409) {
        const sessionId = response.headers.get('X-Transmission-Session-Id');
        if (sessionId) {
          this.sessionId = sessionId;
          // Retry with session ID
          headers['X-Transmission-Session-Id'] = sessionId;
          const retryResponse = await fetch(this.baseUrl, {
            method: 'POST',
            headers,
            body,
          });
          return await retryResponse.json();
        }
      }

      if (!response.ok) {
        throw new Error(`Transmission RPC error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.result !== 'success') {
        throw new Error(`Transmission error: ${data.result}`);
      }

      return data.arguments;
    } catch (error) {
      logger.error('Transmission RPC request failed:', error);
      throw error;
    }
  }

  /**
   * Add torrent by magnet link or torrent file
   */
  async addTorrent(magnetOrTorrent: string, options?: {
    downloadDir?: string;
    paused?: boolean;
    priority?: 'low' | 'normal' | 'high';
  }): Promise<{ id: number; name: string; hashString: string }> {
    try {
      const args: any = {};

      // Check if it's a magnet link or torrent data
      if (magnetOrTorrent.startsWith('magnet:')) {
        args.filename = magnetOrTorrent;
      } else {
        // Assume it's base64 encoded torrent data
        args.metainfo = magnetOrTorrent;
      }

      // Apply options
      if (options?.downloadDir) {
        args['download-dir'] = options.downloadDir;
      }
      if (options?.paused) {
        args.paused = options.paused;
      }

      const result = await this.makeRequest('torrent-add', args);
      
      // Handle duplicate torrent
      if (result['torrent-duplicate']) {
        const duplicate = result['torrent-duplicate'];
        logger.info(`Torrent already exists: ${duplicate.name}`);
        return {
          id: duplicate.id,
          name: duplicate.name,
          hashString: duplicate.hashString
        };
      }

      const added = result['torrent-added'];
      if (!added) {
        throw new Error('Failed to add torrent');
      }

      logger.info(`Torrent added successfully: ${added.name}`);
      return {
        id: added.id,
        name: added.name,
        hashString: added.hashString
      };
    } catch (error) {
      logger.error('Failed to add torrent:', error);
      throw error;
    }
  }

  /**
   * Get torrent information
   */
  async getTorrent(id: number): Promise<TransmissionTorrent | null> {
    try {
      const result = await this.makeRequest('torrent-get', {
        ids: [id],
        fields: [
          'id', 'name', 'status', 'percentDone', 'downloadDir',
          'files', 'peers', 'downloadedEver', 'uploadedEver',
          'rateDownload', 'rateUpload', 'eta', 'hashString'
        ]
      });

      const torrents = result.torrents;
      if (!torrents || torrents.length === 0) {
        return null;
      }

      return torrents[0] as TransmissionTorrent;
    } catch (error) {
      logger.error(`Failed to get torrent ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get all torrents
   */
  async getAllTorrents(): Promise<TransmissionTorrent[]> {
    try {
      const result = await this.makeRequest('torrent-get', {
        fields: [
          'id', 'name', 'status', 'percentDone', 'downloadDir',
          'files', 'peers', 'downloadedEver', 'uploadedEver',
          'rateDownload', 'rateUpload', 'eta', 'hashString'
        ]
      });

      return result.torrents || [];
    } catch (error) {
      logger.error('Failed to get torrents:', error);
      throw error;
    }
  }

  /**
   * Remove torrent
   */
  async removeTorrent(id: number, deleteLocalData: boolean = false): Promise<void> {
    try {
      await this.makeRequest('torrent-remove', {
        ids: [id],
        'delete-local-data': deleteLocalData
      });
      
      logger.info(`Torrent ${id} removed successfully`);
    } catch (error) {
      logger.error(`Failed to remove torrent ${id}:`, error);
      throw error;
    }
  }

  /**
   * Start torrent
   */
  async startTorrent(id: number): Promise<void> {
    try {
      await this.makeRequest('torrent-start', { ids: [id] });
      logger.info(`Torrent ${id} started`);
    } catch (error) {
      logger.error(`Failed to start torrent ${id}:`, error);
      throw error;
    }
  }

  /**
   * Stop torrent
   */
  async stopTorrent(id: number): Promise<void> {
    try {
      await this.makeRequest('torrent-stop', { ids: [id] });
      logger.info(`Torrent ${id} stopped`);
    } catch (error) {
      logger.error(`Failed to stop torrent ${id}:`, error);
      throw error;
    }
  }

  /**
   * Set file priority (for selective downloading)
   */
  async setFilePriority(torrentId: number, fileIndices: number[], priority: 'low' | 'normal' | 'high'): Promise<void> {
    try {
      const priorityMap = { low: -1, normal: 0, high: 1 };
      
      await this.makeRequest('torrent-set', {
        ids: [torrentId],
        'priority-low': priority === 'low' ? fileIndices : [],
        'priority-normal': priority === 'normal' ? fileIndices : [],
        'priority-high': priority === 'high' ? fileIndices : []
      });
      
      logger.info(`File priority set for torrent ${torrentId}`);
    } catch (error) {
      logger.error(`Failed to set file priority for torrent ${torrentId}:`, error);
      throw error;
    }
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<TransmissionStats> {
    try {
      const result = await this.makeRequest('session-stats');
      return {
        activeTorrentCount: result.activeTorrentCount,
        downloadSpeed: result.downloadSpeed,
        uploadSpeed: result.uploadSpeed,
        pausedTorrentCount: result.pausedTorrentCount,
        torrentCount: result.torrentCount
      };
    } catch (error) {
      logger.error('Failed to get session stats:', error);
      throw error;
    }
  }

  /**
   * Test connection to Transmission daemon
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest('session-get');
      return true;
    } catch (error) {
      logger.error('Transmission connection test failed:', error);
      return false;
    }
  }

  /**
   * Get the best video file from a torrent
   */
  async getBestVideoFile(torrentId: number): Promise<{ index: number; file: TransmissionFile } | null> {
    try {
      const torrent = await this.getTorrent(torrentId);
      if (!torrent || !torrent.files) {
        return null;
      }

      // Filter video files
      const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
      const videoFiles = torrent.files
        .map((file, index) => ({ file, index }))
        .filter(({ file }) => 
          videoExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
        );

      if (videoFiles.length === 0) {
        return null;
      }

      // Sort by file size (largest first, assuming it's the main video)
      videoFiles.sort((a, b) => b.file.length - a.file.length);
      
      return videoFiles[0];
    } catch (error) {
      logger.error(`Failed to get best video file for torrent ${torrentId}:`, error);
      throw error;
    }
  }
}