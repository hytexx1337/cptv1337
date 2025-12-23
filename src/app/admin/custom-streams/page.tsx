'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { CustomStream } from '@/types/custom-stream';
import { PlusIcon, TrashIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function CustomStreamsAdmin() {
  const [streams, setStreams] = useState<CustomStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form state
  const [formData, setFormData] = useState({
    tmdbId: '',
    type: 'tv' as 'movie' | 'tv',
    title: '',
    streamUrl: '',
    language: 'es-MX',
    quality: '1080p',
    season: '',
    episode: '',
    episodeTitle: '',
    notes: ''
  });

  // Cargar streams
  const loadStreams = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/custom-stream');
      if (response.ok) {
        const data = await response.json();
        setStreams(data.streams || []);
      }
    } catch (error) {
      console.error('Error loading streams:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStreams();
  }, []);

  // Agregar/Actualizar stream
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/admin/custom-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Stream ${data.action === 'created' ? 'agregado' : 'actualizado'} correctamente`);
        setShowForm(false);
        resetForm();
        loadStreams();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error submitting stream:', error);
      alert('Error al guardar el stream');
    }
  };

  // Eliminar stream
  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este stream?')) return;

    try {
      const response = await fetch(`/api/admin/custom-stream?id=${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        alert('Stream eliminado correctamente');
        loadStreams();
      } else {
        alert('Error al eliminar el stream');
      }
    } catch (error) {
      console.error('Error deleting stream:', error);
      alert('Error al eliminar el stream');
    }
  };

  const resetForm = () => {
    setFormData({
      tmdbId: '',
      type: 'tv',
      title: '',
      streamUrl: '',
      language: 'es-MX',
      quality: '1080p',
      season: '',
      episode: '',
      episodeTitle: '',
      notes: ''
    });
  };

  // Filtrar streams por búsqueda
  const filteredStreams = streams.filter(s => 
    s.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.tmdbId?.toString().includes(searchTerm) ||
    s.episodeTitle?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      
      <div className="container mx-auto px-4 pt-32 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold">Streams Personalizados</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold transition"
          >
            <PlusIcon className="w-5 h-5" />
            {showForm ? 'Cancelar' : 'Agregar Stream'}
          </button>
        </div>

        {/* Formulario */}
        {showForm && (
          <div className="bg-gray-900 rounded-lg p-6 mb-8">
            <h2 className="text-2xl font-bold mb-6">Nuevo Stream</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tipo */}
                <div>
                  <label className="block text-sm font-medium mb-2">Tipo</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as 'movie' | 'tv' })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
                    required
                  >
                    <option value="tv">Serie</option>
                    <option value="movie">Película</option>
                  </select>
                </div>

                {/* TMDB ID */}
                <div>
                  <label className="block text-sm font-medium mb-2">TMDB ID</label>
                  <input
                    type="number"
                    value={formData.tmdbId}
                    onChange={(e) => setFormData({ ...formData, tmdbId: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="123456"
                    required
                  />
                </div>

                {/* Título */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Título</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="Nombre de la serie o película"
                    required
                  />
                </div>

                {/* Temporada y Episodio (solo para series) */}
                {formData.type === 'tv' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">Temporada</label>
                      <input
                        type="number"
                        value={formData.season}
                        onChange={(e) => setFormData({ ...formData, season: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
                        placeholder="1"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Episodio</label>
                      <input
                        type="number"
                        value={formData.episode}
                        onChange={(e) => setFormData({ ...formData, episode: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
                        placeholder="1"
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-2">Título del Episodio</label>
                      <input
                        type="text"
                        value={formData.episodeTitle}
                        onChange={(e) => setFormData({ ...formData, episodeTitle: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
                        placeholder="Opcional"
                      />
                    </div>
                  </>
                )}

                {/* URL del Stream */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">URL del Stream</label>
                  <input
                    type="url"
                    value={formData.streamUrl}
                    onChange={(e) => setFormData({ ...formData, streamUrl: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="https://..."
                    required
                  />
                </div>

                {/* Idioma */}
                <div>
                  <label className="block text-sm font-medium mb-2">Idioma</label>
                  <select
                    value={formData.language}
                    onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
                  >
                    <option value="es-MX">Español Latino</option>
                    <option value="es-ES">Español España</option>
                    <option value="en">Inglés</option>
                  </select>
                </div>

                {/* Calidad */}
                <div>
                  <label className="block text-sm font-medium mb-2">Calidad</label>
                  <select
                    value={formData.quality}
                    onChange={(e) => setFormData({ ...formData, quality: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
                  >
                    <option value="2160p">4K (2160p)</option>
                    <option value="1080p">Full HD (1080p)</option>
                    <option value="720p">HD (720p)</option>
                    <option value="480p">SD (480p)</option>
                  </select>
                </div>

                {/* Notas */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Notas</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
                    rows={3}
                    placeholder="Notas adicionales..."
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 py-3 rounded-lg font-semibold transition"
              >
                Guardar Stream
              </button>
            </form>
          </div>
        )}

        {/* Búsqueda */}
        <div className="mb-6">
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por título o TMDB ID..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-12 pr-4 py-3"
            />
          </div>
        </div>

        {/* Lista de Streams */}
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          {loading ? (
            <div className="text-center py-20">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
            </div>
          ) : filteredStreams.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              {searchTerm ? 'No se encontraron streams' : 'No hay streams agregados'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="px-6 py-4 text-left">Tipo</th>
                    <th className="px-6 py-4 text-left">Título</th>
                    <th className="px-6 py-4 text-left">TMDB ID</th>
                    <th className="px-6 py-4 text-left">S/E</th>
                    <th className="px-6 py-4 text-left">Idioma</th>
                    <th className="px-6 py-4 text-left">Calidad</th>
                    <th className="px-6 py-4 text-left">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredStreams.map((stream) => (
                    <tr key={stream.id} className="hover:bg-gray-800/50 transition">
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          stream.type === 'movie' ? 'bg-blue-600/20 text-blue-400' : 'bg-purple-600/20 text-purple-400'
                        }`}>
                          {stream.type === 'movie' ? 'Película' : 'Serie'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-semibold">{stream.title}</div>
                          {stream.episodeTitle && (
                            <div className="text-sm text-gray-400">{stream.episodeTitle}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-400">{stream.tmdbId}</td>
                      <td className="px-6 py-4">
                        {stream.type === 'tv' && (
                          <span className="text-gray-400">
                            S{stream.season}E{stream.episode}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-400">{stream.language}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-400">{stream.quality || 'N/A'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleDelete(stream.id)}
                          className="text-red-500 hover:text-red-400 transition"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-6 text-center text-gray-400">
          Total: {filteredStreams.length} stream{filteredStreams.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}

