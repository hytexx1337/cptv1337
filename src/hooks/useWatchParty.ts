import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const WATCHPARTY_SERVER = 'http://81.17.102.98';

interface User {
  id: string;
  username: string;
  isHost: boolean;
}

interface ChatMessage {
  user: string;
  message: string;
  timestamp: number;
}

interface VideoState {
  currentTime: number;
  isPlaying: boolean;
  url: string;
  title: string;
}

interface UseWatchPartyOptions {
  roomId?: string;
  username: string;
  videoUrl: string;
  videoTitle: string;
  isHost?: boolean;
  onVideoPlay?: (currentTime: number) => void;
  onVideoPause?: (currentTime: number) => void;
  onVideoSeek?: (currentTime: number) => void;
  onSyncState?: (currentTime: number, isPlaying: boolean) => void;
}

export function useWatchParty({
  roomId: initialRoomId,
  username,
  videoUrl,
  videoTitle,
  isHost = false,
  onVideoPlay,
  onVideoPause,
  onVideoSeek,
  onSyncState
}: UseWatchPartyOptions) {
  const [roomId, setRoomId] = useState<string | null>(initialRoomId || null);
  const [isConnected, setIsConnected] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const isSyncingRef = useRef(false); // Para evitar loops de sincronización

  // Crear sala
  const createRoom = useCallback(async () => {
    try {
      const response = await fetch(`${WATCHPARTY_SERVER}/api/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          videoTitle,
          username
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create room');
      }

      const data = await response.json();
      setRoomId(data.roomId);
      return data.roomId;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, [videoUrl, videoTitle, username]);

  // Conectar al WebSocket
  useEffect(() => {
    if (!roomId) return;

    const socket = io(WATCHPARTY_SERVER, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔌 Conectado al servidor Watch Party');
      setIsConnected(true);
      setError(null);

      // Unirse a la sala
      socket.emit('join-room', {
        roomId,
        username,
        isHost
      });
    });

    socket.on('disconnect', () => {
      console.log('🔌 Desconectado del servidor Watch Party');
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Error de conexión:', err);
      setError('Error de conexión al servidor');
    });

    // Recibir estado inicial de la sala
    socket.on('room-state', ({ videoState, users: roomUsers, messages: roomMessages }) => {
      console.log('📡 Estado de la sala recibido');
      setUsers(roomUsers);
      setMessages(roomMessages);

      // Sincronizar video con el estado de la sala
      if (onSyncState) {
        onSyncState(videoState.currentTime, videoState.isPlaying);
      }
    });

    // Usuario se unió
    socket.on('user-joined', ({ username: newUsername, userCount }) => {
      console.log(`👤 ${newUsername} se unió (${userCount} usuarios)`);
    });

    // Usuario se fue
    socket.on('user-left', ({ username: leftUsername, userCount }) => {
      console.log(`👋 ${leftUsername} salió (${userCount} usuarios)`);
    });

    // Lista de usuarios actualizada
    socket.on('user-list', ({ users: updatedUsers }) => {
      setUsers(updatedUsers);
    });

    // Nuevo host asignado
    socket.on('new-host', ({ hostUsername }) => {
      console.log(`👑 Nuevo host: ${hostUsername}`);
    });

    // Eventos de video
    socket.on('video-play', ({ currentTime }) => {
      if (!isSyncingRef.current && onVideoPlay) {
        isSyncingRef.current = true;
        onVideoPlay(currentTime);
        setTimeout(() => { isSyncingRef.current = false; }, 500);
      }
    });

    socket.on('video-pause', ({ currentTime }) => {
      if (!isSyncingRef.current && onVideoPause) {
        isSyncingRef.current = true;
        onVideoPause(currentTime);
        setTimeout(() => { isSyncingRef.current = false; }, 500);
      }
    });

    socket.on('video-seek', ({ currentTime }) => {
      if (!isSyncingRef.current && onVideoSeek) {
        isSyncingRef.current = true;
        onVideoSeek(currentTime);
        setTimeout(() => { isSyncingRef.current = false; }, 500);
      }
    });

    socket.on('sync-state', ({ currentTime, isPlaying }) => {
      if (!isSyncingRef.current && onSyncState) {
        isSyncingRef.current = true;
        onSyncState(currentTime, isPlaying);
        setTimeout(() => { isSyncingRef.current = false; }, 500);
      }
    });

    // Chat
    socket.on('chat-message', (message: ChatMessage) => {
      setMessages(prev => [...prev, message]);
    });

    // Error
    socket.on('error', ({ message }) => {
      setError(message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, username, isHost, onVideoPlay, onVideoPause, onVideoSeek, onSyncState]);

  // Emitir eventos de video
  const emitPlay = useCallback((currentTime: number) => {
    if (socketRef.current && roomId && !isSyncingRef.current) {
      socketRef.current.emit('video-play', { roomId, currentTime });
    }
  }, [roomId]);

  const emitPause = useCallback((currentTime: number) => {
    if (socketRef.current && roomId && !isSyncingRef.current) {
      socketRef.current.emit('video-pause', { roomId, currentTime });
    }
  }, [roomId]);

  const emitSeek = useCallback((currentTime: number) => {
    if (socketRef.current && roomId && !isSyncingRef.current) {
      socketRef.current.emit('video-seek', { roomId, currentTime });
    }
  }, [roomId]);

  // Sincronización periódica (solo el host)
  const emitSyncState = useCallback((currentTime: number, isPlaying: boolean) => {
    if (socketRef.current && roomId && isHost) {
      socketRef.current.emit('sync-state', { roomId, currentTime, isPlaying });
    }
  }, [roomId, isHost]);

  // Enviar mensaje de chat
  const sendMessage = useCallback((message: string) => {
    if (socketRef.current && roomId && message.trim()) {
      socketRef.current.emit('chat-message', { roomId, message: message.trim() });
    }
  }, [roomId]);

  // Salir de la sala
  const leaveRoom = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      setRoomId(null);
      setIsConnected(false);
      setUsers([]);
      setMessages([]);
    }
  }, []);

  return {
    roomId,
    isConnected,
    users,
    messages,
    error,
    createRoom,
    emitPlay,
    emitPause,
    emitSeek,
    emitSyncState,
    sendMessage,
    leaveRoom
  };
}

