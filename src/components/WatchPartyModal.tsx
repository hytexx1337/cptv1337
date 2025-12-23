'use client';

import { useState, useEffect, useRef } from 'react';
import { XMarkIcon, UserGroupIcon, ChatBubbleLeftIcon, LinkIcon, CheckIcon } from '@heroicons/react/24/solid';

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

interface WatchPartyModalProps {
  roomId: string;
  users: User[];
  messages: ChatMessage[];
  isHost: boolean;
  onClose: () => void;
  onSendMessage: (message: string) => void;
}

export default function WatchPartyModal({
  roomId,
  users,
  messages,
  isHost,
  onClose,
  onSendMessage
}: WatchPartyModalProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'users'>('chat');
  const [messageInput, setMessageInput] = useState('');
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageInput.trim()) {
      onSendMessage(messageInput);
      setMessageInput('');
    }
  };

  const copyRoomLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?watchparty=${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed top-20 right-4 w-80 h-[calc(100vh-6rem)] bg-black/95 backdrop-blur-sm rounded-lg shadow-2xl border border-gray-700 flex flex-col z-50">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold text-lg">Watch Party</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Room ID y botón copiar */}
        <div className="flex items-center gap-2 bg-gray-800/50 rounded px-3 py-2">
          <span className="text-sm text-gray-400 flex-1">
            Sala: <span className="text-white font-mono">{roomId}</span>
          </span>
          <button
            onClick={copyRoomLink}
            className="text-blue-400 hover:text-blue-300 transition-colors"
            title="Copiar link"
          >
            {copied ? (
              <CheckIcon className="w-4 h-4 text-green-400" />
            ) : (
              <LinkIcon className="w-4 h-4" />
            )}
          </button>
        </div>

        {isHost && (
          <div className="mt-2 text-xs text-yellow-400 flex items-center gap-1">
            <span>👑</span>
            <span>Eres el host</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'chat'
              ? 'text-white bg-gray-800/50 border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <ChatBubbleLeftIcon className="w-4 h-4 inline mr-2" />
          Chat
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'users'
              ? 'text-white bg-gray-800/50 border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <UserGroupIcon className="w-4 h-4 inline mr-2" />
          Usuarios ({users.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' ? (
          <div className="h-full flex flex-col">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 text-sm mt-8">
                  No hay mensajes aún
                </div>
              ) : (
                messages.map((msg, index) => (
                  <div key={index} className="break-words">
                    <div className="text-xs text-gray-500 mb-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                    <div>
                      <span className="text-blue-400 font-medium text-sm">
                        {msg.user}:
                      </span>{' '}
                      <span className="text-white text-sm">{msg.message}</span>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 bg-gray-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={200}
                />
                <button
                  type="submit"
                  disabled={!messageInput.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                >
                  Enviar
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="p-4 space-y-2 overflow-y-auto h-full">
            {users.length === 0 ? (
              <div className="text-center text-gray-500 text-sm mt-8">
                No hay usuarios conectados
              </div>
            ) : (
              users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-2 bg-gray-800/50 rounded px-3 py-2"
                >
                  {user.isHost && <span className="text-yellow-400">👑</span>}
                  <span className="text-white text-sm flex-1">{user.username}</span>
                  {user.isHost && (
                    <span className="text-xs text-gray-400">Host</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

