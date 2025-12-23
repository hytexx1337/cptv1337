# 🎬 Sistema de Streaming Modular

Este módulo contiene todos los componentes y hooks necesarios para reproducir torrents con subtítulos.

## 📁 Estructura

```
src/
├── hooks/
│   ├── useVideoPlayer.ts       # Lógica del reproductor VideoJS
│   ├── useTorrentStream.ts     # Lógica de streaming de torrents
│   └── useSubtitles.ts         # Lógica de subtítulos
└── components/streaming/
    ├── StreamingPlayer.tsx     # Componente principal (wrapper)
    ├── VideoPlayer.tsx         # Componente del reproductor
    ├── TorrentSelector.tsx     # Selector de archivos del torrent
    └── SubtitleControls.tsx    # Controles de subtítulos
```

## 🚀 Uso básico

### Opción 1: En un modal (recomendado para tu caso)

```tsx
'use client';

import { useState } from 'react';
import StreamingPlayer from '@/components/streaming/StreamingPlayer';

export default function MovieModal({ movie, isOpen, onClose }) {
  const [magnetUri, setMagnetUri] = useState('');
  
  // Cuando el usuario hace click en "Reproducir"
  const handlePlay = async () => {
    // Obtener magnet del torrent seleccionado
    const magnet = await getTorrentMagnet(movie.id);
    setMagnetUri(magnet);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        {!magnetUri ? (
          <div>
            {/* Mostrar lista de torrents disponibles */}
            <button onClick={handlePlay}>Reproducir</button>
          </div>
        ) : (
          <StreamingPlayer
            magnetUri={magnetUri}
            movieMetadata={{
              imdbId: movie.imdb_id,
              tmdbId: movie.id.toString(),
              title: movie.title,
            }}
            onError={(error) => console.error(error)}
          />
        )}
      </div>
    </Modal>
  );
}
```

### Opción 2: En una página dedicada

```tsx
// app/watch/[id]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import StreamingPlayer from '@/components/streaming/StreamingPlayer';

export default function WatchPage() {
  const params = useParams();
  const [magnetUri, setMagnetUri] = useState('');
  const [movieData, setMovieData] = useState(null);

  useEffect(() => {
    // Cargar info de la película y obtener magnet
    loadMovieAndTorrent(params.id);
  }, [params.id]);

  return (
    <div className="min-h-screen bg-black p-4">
      <div className="max-w-6xl mx-auto">
        {magnetUri && (
          <StreamingPlayer
            magnetUri={magnetUri}
            movieMetadata={{
              imdbId: movieData?.imdb_id,
              tmdbId: movieData?.id.toString(),
              title: movieData?.title,
            }}
          />
        )}
      </div>
    </div>
  );
}
```

### Para series de TV

```tsx
<StreamingPlayer
  magnetUri={magnetUri}
  tvMetadata={{
    tmdbId: series.id.toString(),
    title: series.name,
    season: selectedSeason,
    episode: selectedEpisode,
  }}
  onError={(error) => console.error(error)}
/>
```

## 🔧 Props de StreamingPlayer

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `magnetUri` | `string` | ✅ | Enlace magnet del torrent |
| `serverUrl` | `string` | ❌ | URL del servidor de streaming (default: configurado) |
| `movieMetadata` | `object` | ❌ | Metadata de película para subtítulos |
| `tvMetadata` | `object` | ❌ | Metadata de serie para subtítulos |
| `onError` | `function` | ❌ | Callback cuando hay un error |

## ✨ Características

### Reproducción de Video
- ✅ Reproductor VideoJS profesional
- ✅ Controles personalizados (play, pause, volumen, pantalla completa)
- ✅ Velocidades de reproducción (0.5x, 1x, 1.25x, 1.5x, 2x)
- ✅ Auto-hide de controles
- ✅ Tema personalizado

### Gestión de Torrents
- ✅ Inicio automático de streaming
- ✅ Selector de archivos (si el torrent tiene múltiples videos)
- ✅ Sistema de heartbeat para mantener el stream activo
- ✅ Limpieza automática al desmontar

### Subtítulos
- ✅ Búsqueda automática por hash (OpenSubtitles)
- ✅ Carga de subtítulos externos (.srt, .vtt, .ass)
- ✅ Subtítulos embebidos del MKV (si existen)
- ✅ Conversión automática SRT → VTT
- ✅ Detección de idioma

## 🎨 Personalización

### Cambiar el tema del reproductor

Edita el archivo CSS o agrega estilos personalizados:

```css
/* En tu archivo global.css */
.vjs-theme-forest .vjs-control-bar {
  background: rgba(0, 0, 0, 0.9) !important;
}

.vjs-theme-forest .vjs-play-progress {
  background: #your-color !important;
}
```

### Cambiar el servidor de streaming

```tsx
<StreamingPlayer
  magnetUri={magnetUri}
  serverUrl="http://tu-servidor:3001"
  // ...
/>
```

## 📝 Notas importantes

1. **VideoJS**: Asegúrate de que `video.js` esté instalado en el proyecto
2. **Subtítulos Service**: El hook usa `@/lib/subtitles-service` (ya lo tienes)
3. **Servidor de streaming**: Debe estar corriendo en el `serverUrl` configurado
4. **Limpieza**: Los componentes limpian automáticamente recursos al desmontarse

## 🐛 Troubleshooting

### El video no carga
- Verifica que el servidor de streaming esté corriendo
- Revisa la consola para ver logs detallados
- Asegúrate de que el magnet URI sea válido

### Los subtítulos no aparecen
- El archivo debe ser .srt, .vtt, o .ass
- Revisa que la búsqueda automática no esté bloqueada
- Intenta cargar un subtítulo manualmente

### El reproductor se ve mal
- Asegúrate de importar `video.js/dist/video-js.css`
- Verifica que el tema esté aplicado correctamente

