'use client';

import React, { useState } from 'react';
import { useVideoPlayer } from '@/hooks/useVideoPlayer';
import VideoPlayer from '@/components/streaming/VideoPlayer';

export default function SimplePlayerPage() {
  const [type, setType] = useState<'movie' | 'tv'>('movie');
  const [id, setId] = useState('');
  const [season, setSeason] = useState('');
  const [episode, setEpisode] = useState('');
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { videoRef } = useVideoPlayer({
    streamUrl,
    movieTitle: 'Sandbox Player',
    onError: (msg) => setError(msg),
    onReady: () => setError(null),
  });

  const playDemo = () => {
    setError(null);
    setStreamUrl('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
  };

  const captureAndPlay = async () => {
    setLoading(true);
    setError(null);
    setStreamUrl(null);
    try {
      const params = new URLSearchParams({
        type,
        id,
      });
      if (type === 'tv') {
        if (season) params.set('season', season);
        if (episode) params.set('episode', episode);
      }
      // 1) Intento RÁPIDO: endpoint sin Playwright
      const fastRes = await fetch(`/api/111movies?${params.toString()}`, { cache: 'no-store' });
      if (fastRes.ok) {
        const fastData = await fastRes.json();
        if (fastData?.streamUrl) {
          setStreamUrl(fastData.streamUrl);
          return;
        }
      }

      // 2) Fallback: Puppeteer (captura real del stream)
      const ppRes = await fetch(`/api/111movies-puppeteer?${params.toString()}`);
      const ppData = await ppRes.json();
      if (!ppRes.ok) {
        setError(ppData?.error || 'Error capturando stream');
        return;
      }
      setStreamUrl(ppData.streamUrl);
    } catch (e: any) {
      setError(e?.message || 'Fallo de red');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16, color: '#fff' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: '#b91c1c', color: '#fff', textAlign: 'center', padding: '8px 0', zIndex: 9999 }}>SANDBOX SIMPLE PLAYER</div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginTop: 48 }}>Simple Player (Sandbox)</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 14 }}>Tipo</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'movie' | 'tv')}
            style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px', color: '#fff' }}
          >
            <option value="movie">movie</option>
            <option value="tv">tv</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 14, minWidth: 60 }}>ID</label>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="slug o id de 111movies"
            style={{ flex: 1, background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px', color: '#fff' }}
          />
        </div>
        {type === 'tv' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 14 }}>S</label>
            <input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="temporada"
              style={{ width: 96, background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px', color: '#fff' }}
            />
            <label style={{ fontSize: 14 }}>E</label>
            <input
              value={episode}
              onChange={(e) => setEpisode(e.target.value)}
              placeholder="episodio"
              style={{ width: 96, background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px', color: '#fff' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={captureAndPlay}
            disabled={loading || !id}
            style={{ background: '#dc2626', color: '#fff', padding: '8px 12px', borderRadius: 6, opacity: loading || !id ? 0.6 : 1 }}
          >
            {loading ? 'Capturando…' : 'Capturar y reproducir'}
          </button>
          <button
            onClick={playDemo}
            style={{ background: '#2563eb', color: '#fff', padding: '8px 12px', borderRadius: 6 }}
          >
            Probar HLS demo
          </button>
        </div>
        {error && (
          <div style={{ color: '#fca5a5', fontSize: 14 }}>{error}</div>
        )}
      </div>

      <div style={{ border: '1px solid #374151', borderRadius: 8, overflow: 'hidden', marginTop: 16 }}>
        <div style={{ background: '#111827', padding: 8, fontSize: 14, color: '#d1d5db' }}>Reproductor</div>
        <div style={{ height: '60vh', background: '#000' }}>
          {streamUrl ? (
            <VideoPlayer videoRef={videoRef} />
          ) : (
            <div style={{ color: '#9ca3af', fontSize: 14, padding: 16 }}>Carga una URL primero</div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#9ca3af', wordBreak: 'break-all', marginTop: 8 }}>
        {streamUrl ? (
          <div>
            <span style={{ color: '#6b7280' }}>URL:</span> {streamUrl}
          </div>
        ) : (
          <span style={{ color: '#6b7280' }}>Sin URL aún</span>
        )}
      </div>
    </div>
  );
}