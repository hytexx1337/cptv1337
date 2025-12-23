import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './logger';

export interface HLSConfig {
  segmentDuration: number; // seconds
  playlistSize: number; // number of segments to keep
  outputDir: string;
  quality: 'low' | 'medium' | 'high' | 'auto';
  startOffset?: number; // seconds to start from
}

export interface HLSStream {
  id: string;
  playlistPath: string;
  segmentDir: string;
  process?: ChildProcess;
  status: 'starting' | 'running' | 'stopped' | 'error';
  error?: string;
}

export class HLSPipeline {
  private streams: Map<string, HLSStream> = new Map();
  private readonly defaultConfig: HLSConfig = {
    segmentDuration: 6,
    playlistSize: 10,
    outputDir: '/tmp/hls-streams',
    quality: 'medium'
  };

  constructor(private baseOutputDir: string = '/tmp/hls-streams') {
    this.defaultConfig.outputDir = baseOutputDir;
  }

  /**
   * Start HLS conversion for a video file
   */
  async startHLSStream(
    streamId: string,
    inputPath: string,
    config: Partial<HLSConfig> = {}
  ): Promise<HLSStream> {
    try {
      // Check if stream already exists
      if (this.streams.has(streamId)) {
        const existingStream = this.streams.get(streamId)!;
        if (existingStream.status === 'running') {
          return existingStream;
        }
        // Clean up old stream
        await this.stopHLSStream(streamId);
      }

      const finalConfig = { ...this.defaultConfig, ...config };
      const segmentDir = path.join(finalConfig.outputDir, streamId);
      const playlistPath = path.join(segmentDir, 'playlist.m3u8');

      // Create output directory
      await fs.mkdir(segmentDir, { recursive: true });

      // Build FFmpeg command
      const ffmpegArgs = this.buildFFmpegArgs(inputPath, segmentDir, finalConfig);
      
      logger.info(`Starting HLS stream ${streamId} with command: ffmpeg ${ffmpegArgs.join(' ')}`);

      // Start FFmpeg process
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const stream: HLSStream = {
        id: streamId,
        playlistPath,
        segmentDir,
        process: ffmpegProcess,
        status: 'starting'
      };

      this.streams.set(streamId, stream);

      // Handle process events
      ffmpegProcess.stdout?.on('data', (data) => {
        logger.debug(`FFmpeg stdout [${streamId}]:`, data.toString());
      });

      ffmpegProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        logger.debug(`FFmpeg stderr [${streamId}]:`, output);
        
        // Check if stream is ready (first segment created)
        if (output.includes('Opening') && output.includes('.ts') && stream.status === 'starting') {
          stream.status = 'running';
          logger.info(`HLS stream ${streamId} is now running`);
        }
      });

      ffmpegProcess.on('close', (code) => {
        logger.info(`FFmpeg process for stream ${streamId} exited with code ${code}`);
        if (stream.status === 'running') {
          stream.status = code === 0 ? 'stopped' : 'error';
          if (code !== 0) {
            stream.error = `FFmpeg exited with code ${code}`;
          }
        }
      });

      ffmpegProcess.on('error', (error) => {
        logger.error(`FFmpeg process error for stream ${streamId}:`, error);
        stream.status = 'error';
        stream.error = error.message;
      });

      // Wait a bit for the process to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      return stream;
    } catch (error) {
      logger.error(`Failed to start HLS stream ${streamId}:`, error);
      throw error;
    }
  }

  /**
   * Stop HLS stream
   */
  async stopHLSStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      return;
    }

    try {
      if (stream.process && !stream.process.killed) {
        stream.process.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (stream.process && !stream.process.killed) {
              stream.process.kill('SIGKILL');
            }
            resolve();
          }, 5000);

          stream.process!.on('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }

      stream.status = 'stopped';
      logger.info(`HLS stream ${streamId} stopped`);
    } catch (error) {
      logger.error(`Error stopping HLS stream ${streamId}:`, error);
    }
  }

  /**
   * Get stream status
   */
  getStream(streamId: string): HLSStream | undefined {
    return this.streams.get(streamId);
  }

  /**
   * Get all active streams
   */
  getAllStreams(): HLSStream[] {
    return Array.from(this.streams.values());
  }

  /**
   * Check if playlist file exists and is ready
   */
  async isStreamReady(streamId: string): Promise<boolean> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      return false;
    }

    try {
      await fs.access(stream.playlistPath);
      const stats = await fs.stat(stream.playlistPath);
      return stats.size > 0;
    } catch {
      return false;
    }
  }

  /**
   * Clean up old streams and segments
   */
  async cleanup(maxAge: number = 3600000): Promise<void> { // 1 hour default
    const now = Date.now();
    
    for (const [streamId, stream] of this.streams.entries()) {
      if (stream.status === 'stopped' || stream.status === 'error') {
        try {
          // Remove stream directory
          await fs.rm(stream.segmentDir, { recursive: true, force: true });
          this.streams.delete(streamId);
          logger.info(`Cleaned up HLS stream ${streamId}`);
        } catch (error) {
          logger.error(`Failed to cleanup stream ${streamId}:`, error);
        }
      }
    }
  }

  /**
   * Build FFmpeg arguments for HLS conversion
   */
  private buildFFmpegArgs(inputPath: string, outputDir: string, config: HLSConfig): string[] {
    const args = [
      '-i', inputPath,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-f', 'hls',
    ];

    // Video quality settings
    switch (config.quality) {
      case 'low':
        args.push('-crf', '28', '-preset', 'veryfast', '-s', '854x480');
        break;
      case 'medium':
        args.push('-crf', '23', '-preset', 'fast', '-s', '1280x720');
        break;
      case 'high':
        args.push('-crf', '18', '-preset', 'medium', '-s', '1920x1080');
        break;
      case 'auto':
        args.push('-crf', '23', '-preset', 'fast');
        break;
    }

    // HLS specific settings
    args.push(
      '-hls_time', config.segmentDuration.toString(),
      '-hls_list_size', config.playlistSize.toString(),
      '-hls_flags', 'delete_segments+append_list',
      '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts'),
    );

    // Start offset if specified
    if (config.startOffset) {
      args.unshift('-ss', config.startOffset.toString());
    }

    // Output playlist
    args.push(path.join(outputDir, 'playlist.m3u8'));

    // Overwrite output files
    args.unshift('-y');

    return args;
  }

  /**
   * Get stream URL for a given stream ID
   */
  getStreamUrl(streamId: string, baseUrl: string): string | null {
    const stream = this.streams.get(streamId);
    if (!stream || stream.status !== 'running') {
      return null;
    }

    return `${baseUrl}/hls/${streamId}/playlist.m3u8`;
  }

  /**
   * Create adaptive bitrate streams (multiple qualities)
   */
  async startAdaptiveHLSStream(
    streamId: string,
    inputPath: string,
    qualities: Array<{ name: string; config: Partial<HLSConfig> }> = [
      { name: 'low', config: { quality: 'low' } },
      { name: 'medium', config: { quality: 'medium' } },
      { name: 'high', config: { quality: 'high' } }
    ]
  ): Promise<HLSStream[]> {
    const streams: HLSStream[] = [];

    for (const quality of qualities) {
      const qualityStreamId = `${streamId}_${quality.name}`;
      try {
        const stream = await this.startHLSStream(qualityStreamId, inputPath, quality.config);
        streams.push(stream);
      } catch (error) {
        logger.error(`Failed to start ${quality.name} quality stream for ${streamId}:`, error);
      }
    }

    // Create master playlist
    await this.createMasterPlaylist(streamId, streams);

    return streams;
  }

  /**
   * Create master playlist for adaptive streaming
   */
  private async createMasterPlaylist(streamId: string, streams: HLSStream[]): Promise<void> {
    const masterDir = path.join(this.defaultConfig.outputDir, streamId);
    await fs.mkdir(masterDir, { recursive: true });

    const masterPlaylistPath = path.join(masterDir, 'master.m3u8');
    
    let masterContent = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
    
    for (const stream of streams) {
      const qualityName = stream.id.split('_').pop();
      let bandwidth = 1000000; // Default 1Mbps
      let resolution = '1280x720';
      
      switch (qualityName) {
        case 'low':
          bandwidth = 500000;
          resolution = '854x480';
          break;
        case 'medium':
          bandwidth = 1500000;
          resolution = '1280x720';
          break;
        case 'high':
          bandwidth = 3000000;
          resolution = '1920x1080';
          break;
      }
      
      masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}\n`;
      masterContent += `${stream.id}/playlist.m3u8\n\n`;
    }

    await fs.writeFile(masterPlaylistPath, masterContent);
    logger.info(`Master playlist created for stream ${streamId}`);
  }
}