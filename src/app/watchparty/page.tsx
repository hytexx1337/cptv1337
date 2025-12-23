'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { UserGroupIcon, MagnifyingGlassIcon, LockClosedIcon, GlobeAltIcon, PlayIcon, ArrowLeftIcon } from '@heroicons/react/24/solid';
import Header from '@/components/Header';
import { MediaItem } from '@/types/tmdb';
import { getImageUrl, getOriginalTitle, getYear, getReleaseDate } from '@/lib/tmdb';
import LoadingSpinner from '@/components/LoadingSpinner';

const WATCHPARTY_SERVER = process.env.NEXT_PUBLIC_WATCHPARTY_SERVER_URL || 'https://watchparty.cineparatodos.lat';

type ViewMode = 'home' | 'create' | 'join' | 'browse';

interface Room {
  id: string;
  videoTitle: string;
  userCount: number;
  createdAt: number;
}

function WatchPartyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinRoomId = searchParams.get('room');
  
  const [viewMode, setViewMode] = useState<ViewMode>(joinRoomId ? 'join' : 'home');
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState(joinRoomId || '');
  
  // Estados para crear sala
  const [isPublic, setIsPublic] = useState(true);
  const [selectedContent, setSelectedContent] = useState<MediaItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Estados para series (temporada/episodio)
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(1);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  
  // Estados para salas públicas
  const [publicRooms, setPublicRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  
  // Cargar nombre de usuario guardado
  useEffect(() => {
    const savedUsername = localStorage.getItem('watchparty-username');
    if (savedUsername) {
      setUsername(savedUsername);
    }
  }, []);
  
  // Cargar temporadas cuando se selecciona una serie
  useEffect(() => {
    if (!selectedContent) {
      setSeasons([]);
      return;
    }
    
    const mediaType = selectedContent.media_type || (selectedContent.title ? 'movie' : 'tv');
    if (mediaType !== 'tv') {
      setSeasons([]);
      return;
    }
    
    const loadSeasons = async () => {
      setLoadingSeasons(true);
      try {
        const response = await fetch(
          `https://api.themoviedb.org/3/tv/${selectedContent.id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`
        );
        const data = await response.json();
        setSeasons(data.seasons || []);
        setSelectedSeason(1);
        setSelectedEpisode(1);
      } catch (error) {
        console.error('Error loading seasons:', error);
      } finally {
        setLoadingSeasons(false);
      }
    };
    
    loadSeasons();
  }, [selectedContent]);
  
  // Cargar salas públicas si está en modo browse
  useEffect(() => {
    if (viewMode === 'browse') {
      loadPublicRooms();
    }
  }, [viewMode]);
  
  const loadPublicRooms = async () => {
    setLoadingRooms(true);
    try {
      const response = await fetch(`/api/watchparty/proxy?path=/api/rooms`);
      if (response.ok) {
        const data = await response.json();
        setPublicRooms(data.rooms || []);
      }
    } catch (error) {
      console.error('Error loading rooms:', error);
    } finally {
      setLoadingRooms(false);
    }
  };
  
  // Buscar contenido
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(`/api/search?query=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = await response.json();
        const filteredResults = data.results
          .filter((item: MediaItem) => 
            (item.media_type === 'movie' || item.media_type === 'tv') && !item.adult
          )
          .slice(0, 12);
        setSearchResults(filteredResults);
      }
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setIsSearching(false);
    }
  };
  
  // Crear sala
  const handleCreateRoom = async () => {
    if (!username.trim() || !selectedContent) {
      alert('Por favor completa todos los campos');
      return;
    }
    
    // Guardar username
    localStorage.setItem('watchparty-username', username.trim());
    
    const mediaType = selectedContent.media_type || (selectedContent.title ? 'movie' : 'tv');
    const contentId = selectedContent.id;
    let contentTitle = getOriginalTitle(selectedContent);
    
    // Si es serie, agregar info de temporada/episodio al título
    if (mediaType === 'tv') {
      contentTitle += ` S${selectedSeason.toString().padStart(2, '0')}E${selectedEpisode.toString().padStart(2, '0')}`;
    }
    
    // Construir URL del contenido
    const contentUrl = `${window.location.origin}/${mediaType}/${contentId}`;
    
    try {
      const response = await fetch(`/api/watchparty/proxy?path=/api/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: contentUrl,
          videoTitle: contentTitle,
          username: username.trim()
        })
      });
      
      if (!response.ok) {
        throw new Error('Error creando sala');
      }
      
      const data = await response.json();
      
      // Guardar username en localStorage para que persista
      localStorage.setItem('watchparty-username', username.trim());
      
      // Construir URL de redirección con parámetros de temporada/episodio si es serie
      let redirectUrl = `/${mediaType}/${contentId}?watchparty=${data.roomId}&username=${encodeURIComponent(username.trim())}`;
      if (mediaType === 'tv') {
        redirectUrl += `&season=${selectedSeason}&episode=${selectedEpisode}`;
      }
      
      // Redirigir a la página del contenido (usar window.location para forzar recarga completa)
      window.location.href = redirectUrl;
      
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Error creando sala. Intenta de nuevo.');
    }
  };
  
  // Unirse a sala
  const handleJoinRoom = async () => {
    if (!username.trim() || !roomId.trim()) {
      alert('Por favor completa todos los campos');
      return;
    }
    
    // Guardar username
    localStorage.setItem('watchparty-username', username.trim());
    
    try {
      // Obtener info de la sala
      const response = await fetch(`/api/watchparty/proxy?path=/api/rooms/${roomId.trim().toUpperCase()}`);
      
      if (!response.ok) {
        alert('Sala no encontrada');
        return;
      }
      
      const roomData = await response.json();
      
      // Redirigir... pero necesitamos el contentId
      // Por ahora, guardar el roomId y mostrar mensaje
      alert(`Sala encontrada: ${roomData.videoTitle}. Nota: Necesitas el link completo del host para unirte.`);
      
    } catch (error) {
      console.error('Error joining room:', error);
      alert('Error uniéndose a la sala');
    }
  };
  
  // Vista Home
  if (viewMode === 'home') {
    return (
      <div className="min-h-screen bg-black">
        <Header />
        
        <div className="pt-32 pb-20 px-4 md:px-8">
          <div className="max-w-6xl mx-auto">
            {/* Hero */}
            <div className="text-center mb-16">
              <div className="flex items-center justify-center mb-6">
                <UserGroupIcon className="w-16 h-16 text-red-500" />
              </div>
              <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                Ve películas y series con amigos en tiempo real. Sincronización automática, chat incluido.
              </p>
            </div>
            
            {/* Opciones */}
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* Crear Sala */}
              <div 
                onClick={() => setViewMode('create')}
                className="bg-gradient-to-br from-red-600 to-red-700 p-8 rounded-2xl cursor-pointer hover:scale-105 transition-transform duration-300 group"
              >
                <div className="flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-6 group-hover:bg-white/30 transition-colors">
                  <PlayIcon className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Crear Sala</h2>
                <p className="text-white/80 mb-4">
                  Crea una sala nueva, elige una película o serie y comparte el link con tus amigos.
                </p>
                <div className="flex items-center gap-2 text-white font-medium">
                  Empezar
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </div>
              
              {/* Unirse a Sala */}
              <div 
                onClick={() => setViewMode('join')}
                className="bg-gradient-to-br from-blue-600 to-blue-700 p-8 rounded-2xl cursor-pointer hover:scale-105 transition-transform duration-300 group"
              >
                <div className="flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-6 group-hover:bg-white/30 transition-colors">
                  <UserGroupIcon className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Unirse a Sala</h2>
                <p className="text-white/80 mb-4">
                  ¿Ya tienes el código de una sala? Únete y empieza a ver con tus amigos.
                </p>
                <div className="flex items-center gap-2 text-white font-medium">
                  Unirse
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </div>
            </div>
            
            {/* Browse Public Rooms */}
            <div className="mt-12 text-center">
              <button
                onClick={() => setViewMode('browse')}
                className="text-gray-400 hover:text-white transition-colors underline"
              >
                Ver salas públicas disponibles
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Vista Crear Sala
  if (viewMode === 'create') {
    return (
      <div className="min-h-screen bg-black">
        <Header />
        
        <div className="pt-32 pb-20 px-4 md:px-8">
          <div className="max-w-4xl mx-auto">
            {/* Back button */}
            <button
              onClick={() => setViewMode('home')}
              className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              Volver
            </button>
            
            {/* Paso 1: Username */}
            <div className="bg-gray-900 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">1. Tu nombre</h2>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ingresa tu nombre"
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                maxLength={20}
              />
            </div>
            
            {/* Paso 2: Tipo de sala */}
            <div className="bg-gray-900 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">2. Tipo de sala</h2>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setIsPublic(true)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    isPublic
                      ? 'border-red-500 bg-red-500/20'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  <GlobeAltIcon className="w-8 h-8 text-white mx-auto mb-2" />
                  <div className="text-white font-medium">Pública</div>
                  <div className="text-gray-400 text-sm mt-1">Cualquiera puede unirse</div>
                </button>
                
                <button
                  onClick={() => setIsPublic(false)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    !isPublic
                      ? 'border-red-500 bg-red-500/20'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  <LockClosedIcon className="w-8 h-8 text-white mx-auto mb-2" />
                  <div className="text-white font-medium">Privada</div>
                  <div className="text-gray-400 text-sm mt-1">Solo con el link</div>
                </button>
              </div>
            </div>
            
            {/* Paso 3: Seleccionar contenido */}
            <div className="bg-gray-900 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">3. Elige qué ver</h2>
              
              {/* Search */}
              <div className="relative mb-6">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Buscar película o serie..."
                  className="w-full bg-gray-800 text-white px-4 py-3 pr-12 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <button
                  onClick={handleSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <MagnifyingGlassIcon className="w-6 h-6" />
                </button>
              </div>
              
              {/* Selected Content */}
              {selectedContent && (
                <>
                  <div className="mb-6 p-4 bg-gray-800 rounded-lg flex items-center gap-4">
                    <Image
                      src={getImageUrl(selectedContent.poster_path, 'w342')}
                      alt={getOriginalTitle(selectedContent)}
                      width={60}
                      height={90}
                      className="rounded"
                    />
                    <div className="flex-1">
                      <div className="text-white font-bold">{getOriginalTitle(selectedContent)}</div>
                      <div className="text-gray-400 text-sm">
                        {getYear(getReleaseDate(selectedContent))} • {selectedContent.media_type === 'movie' ? 'Película' : 'Serie'}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedContent(null)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Cambiar
                    </button>
                  </div>
                  
                  {/* Selector de temporada/episodio para series */}
                  {(selectedContent.media_type === 'tv' || !selectedContent.title) && (
                    <div className="mb-6 p-4 bg-gray-800 rounded-lg">
                      {loadingSeasons ? (
                        <div className="text-gray-400 text-center py-4">Cargando temporadas...</div>
                      ) : seasons.length > 0 ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-white font-medium mb-2">Temporada</label>
                            <select
                              value={selectedSeason}
                              onChange={(e) => setSelectedSeason(Number(e.target.value))}
                              className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                            >
                              {seasons
                                .filter(s => s.season_number > 0)
                                .map(season => (
                                  <option key={season.season_number} value={season.season_number}>
                                    Temporada {season.season_number}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-white font-medium mb-2">Episodio</label>
                            <select
                              value={selectedEpisode}
                              onChange={(e) => setSelectedEpisode(Number(e.target.value))}
                              className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                            >
                              {Array.from(
                                { length: seasons.find(s => s.season_number === selectedSeason)?.episode_count || 10 },
                                (_, i) => i + 1
                              ).map(ep => (
                                <option key={ep} value={ep}>
                                  Episodio {ep}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="text-gray-400 text-center py-4">No se pudieron cargar las temporadas</div>
                      )}
                    </div>
                  )}
                </>
              )}
              
              {/* Search Results */}
              {isSearching && (
                <div className="text-center py-8">
                  <LoadingSpinner />
                </div>
              )}
              
              {searchResults.length > 0 && !selectedContent && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
                  {searchResults.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedContent(item)}
                      className="cursor-pointer group"
                    >
                      <div className="aspect-[2/3] relative rounded-lg overflow-hidden mb-2">
                        <Image
                          src={getImageUrl(item.poster_path, 'w342')}
                          alt={getOriginalTitle(item)}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-colors flex items-center justify-center">
                          <PlayIcon className="w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      <div className="text-white text-sm line-clamp-2 text-center">
                        {getOriginalTitle(item)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Botón Crear */}
            <button
              onClick={handleCreateRoom}
              disabled={!username.trim() || !selectedContent}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-700 disabled:to-gray-800 disabled:cursor-not-allowed text-white py-4 rounded-lg font-bold text-lg transition-all"
            >
              {username.trim() && selectedContent ? 'Crear Sala y Empezar' : 'Completa todos los campos'}
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  // Vista Unirse a Sala
  if (viewMode === 'join') {
    return (
      <div className="min-h-screen bg-black">
        <Header />
        
        <div className="pt-32 pb-20 px-4 md:px-8">
          <div className="max-w-md mx-auto">
            {/* Back button */}
            {!joinRoomId && (
              <button
                onClick={() => setViewMode('home')}
                className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
              >
                <ArrowLeftIcon className="w-5 h-5" />
                Volver
              </button>
            )}
            
            <div className="bg-gray-900 rounded-xl p-8">
              <div className="flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mx-auto mb-6">
                <UserGroupIcon className="w-8 h-8 text-white" />
              </div>
              
              <h1 className="text-3xl font-bold text-white mb-2 text-center">Unirse a Sala</h1>
              <p className="text-gray-400 mb-8 text-center">
                Ingresa el código de la sala para unirte
              </p>
              
              {/* Username */}
              <div className="mb-4">
                <label className="text-white text-sm font-medium mb-2 block">Tu nombre</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ej: Juan"
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={20}
                />
              </div>
              
              {/* Room ID */}
              <div className="mb-6">
                <label className="text-white text-sm font-medium mb-2 block">Código de sala</label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="Ej: ABC123"
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg font-mono text-center text-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={6}
                />
              </div>
              
              <button
                onClick={handleJoinRoom}
                disabled={!username.trim() || !roomId.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold transition-colors"
              >
                Unirse a la Sala
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Vista Browse Salas Públicas
  if (viewMode === 'browse') {
    return (
      <div className="min-h-screen bg-black">
        <Header />
        
        <div className="pt-32 pb-20 px-4 md:px-8">
          <div className="max-w-6xl mx-auto">
            {/* Back button */}
            <button
              onClick={() => setViewMode('home')}
              className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              Volver
            </button>
            
            <div className="flex items-center justify-end mb-8">
              <button
                onClick={loadPublicRooms}
                className="text-gray-400 hover:text-white transition-colors"
              >
                🔄 Actualizar
              </button>
            </div>
            
            {loadingRooms && (
              <div className="text-center py-12">
                <LoadingSpinner />
              </div>
            )}
            
            {!loadingRooms && publicRooms.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg mb-4">No hay salas públicas activas</p>
                <button
                  onClick={() => setViewMode('create')}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  Crear la primera sala
                </button>
              </div>
            )}
            
            {!loadingRooms && publicRooms.length > 0 && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {publicRooms.map((room) => (
                  <div
                    key={room.id}
                    className="bg-gray-900 rounded-xl p-6 hover:bg-gray-800 transition-colors cursor-pointer"
                    onClick={() => {
                      setRoomId(room.id);
                      setViewMode('join');
                    }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                        <UserGroupIcon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-bold line-clamp-1">{room.videoTitle}</div>
                        <div className="text-gray-400 text-sm">
                          {room.userCount} {room.userCount === 1 ? 'usuario' : 'usuarios'}
                        </div>
                      </div>
                    </div>
                    <div className="text-gray-500 text-xs">
                      Sala: {room.id}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  return null;
}

export default function WatchPartyPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <WatchPartyContent />
    </Suspense>
  );
}
