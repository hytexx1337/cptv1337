'use client';

import { logger } from '@/lib/logger';
import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { MagnifyingGlassIcon, Bars3Icon, XMarkIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { MediaItem } from '@/types/tmdb';
import { getImageUrl } from '@/lib/tmdb';

export default function Header() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce function
  const debounce = useCallback((func: Function, delay: number) => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(null, args), delay);
    };
  }, []);

  // Search function
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        const filteredResults = data.results
          .filter((item: MediaItem) => 
            (item.media_type === 'movie' || item.media_type === 'tv') && !item.adult
          )
          .slice(0, 8); // Limitar a 8 resultados para el dropdown
        setSearchResults(filteredResults);
        setShowDropdown(filteredResults.length > 0);
        setSelectedIndex(-1);
      }
    } catch (error) {
      logger.error('Error searching:', error);
      setSearchResults([]);
      setShowDropdown(false);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  const debouncedSearch = useCallback(
    debounce(performSearch, 300),
    [performSearch]
  );

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    debouncedSearch(value);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < searchResults.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
          const selectedItem = searchResults[selectedIndex];
          navigateToItem(selectedItem);
        } else if (searchQuery.trim()) {
          handleSearch(e as any);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Navigate to selected item
  const navigateToItem = (item: MediaItem) => {
    const path = item.media_type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
    router.push(path);
    setSearchQuery('');
    setShowDropdown(false);
    setIsSearchOpen(false);
    setSearchResults([]);
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setSelectedIndex(-1);
        if (!searchQuery.trim()) {
          setIsSearchOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setIsSearchOpen(false);
      setShowDropdown(false);
      setSearchResults([]);
    }
  };

  // Detectar scroll para cambiar el fondo del header
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setIsScrolled(scrollPosition > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-black/10 backdrop-blur-md' : 'bg-transparent'
      }`}
    >
      <div className="relative max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          {/* Logo + Navigation - Izquierda */}
          <div className="flex items-center gap-8">
            <div className="flex-shrink-0">
              <Link href="/" className="flex items-center group transition-all duration-300 hover:scale-105">
                <Image
                  src="/logo.png"
                  alt="CineParaTodos Logo"
                  width={100}
                  height={60}
                  className="relative rounded-md"
                  style={{ width: 'auto', height: 'auto' }}
                />
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-6">
            <Link 
              href="/" 
              className={`relative transition-all duration-300 font-medium text-base tracking-wide group uppercase ${
                pathname === '/' 
                  ? 'text-red-400' 
                  : 'text-white hover:text-red-400'
              }`}
            >
              <span className="relative z-10">Inicio</span>
              <div className={`absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-lg transition-transform duration-300 -z-10 ${
                pathname === '/' ? 'scale-100' : 'scale-0 group-hover:scale-100'
              }`}></div>
              <div className={`absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-300 ${
                pathname === '/' ? 'w-full' : 'w-0 group-hover:w-full'
              }`}></div>
            </Link>
            <Link 
              href="/movies" 
              className={`relative transition-all duration-300 font-medium text-base tracking-wide group uppercase ${
                pathname === '/movies' 
                  ? 'text-red-400' 
                  : 'text-white hover:text-red-400'
              }`}
            >
              <span className="relative z-10">Películas</span>
              <div className={`absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-lg transition-transform duration-300 -z-10 ${
                pathname === '/movies' ? 'scale-100' : 'scale-0 group-hover:scale-100'
              }`}></div>
              <div className={`absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-300 ${
                pathname === '/movies' ? 'w-full' : 'w-0 group-hover:w-full'
              }`}></div>
            </Link>
            <Link 
              href="/tv" 
              className={`relative transition-all duration-300 font-medium text-base tracking-wide group uppercase ${
                pathname === '/tv' 
                  ? 'text-red-400' 
                  : 'text-white hover:text-red-400'
              }`}
            >
              <span className="relative z-10">Series</span>
              <div className={`absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-lg transition-transform duration-300 -z-10 ${
                pathname === '/tv' ? 'scale-100' : 'scale-0 group-hover:scale-100'
              }`}></div>
              <div className={`absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-300 ${
                pathname === '/tv' ? 'w-full' : 'w-0 group-hover:w-full'
              }`}></div>
            </Link>
            <Link 
              href="/anime" 
              className={`relative transition-all duration-300 font-medium text-base tracking-wide group uppercase ${
                pathname === '/anime' 
                  ? 'text-red-400' 
                  : 'text-white hover:text-red-400'
              }`}
            >
              <span className="relative z-10">Anime</span>
              <div className={`absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-lg transition-transform duration-300 -z-10 ${
                pathname === '/anime' ? 'scale-100' : 'scale-0 group-hover:scale-100'
              }`}></div>
              <div className={`absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-300 ${
                pathname === '/anime' ? 'w-full' : 'w-0 group-hover:w-full'
              }`}></div>
            </Link>
            <Link 
              href="/watchparty" 
              className={`relative transition-all duration-300 font-medium text-base tracking-wide group uppercase ${
                pathname === '/watchparty' 
                  ? 'text-red-400' 
                  : 'text-white hover:text-red-400'
              }`}
            >
              <span className="relative z-10 flex items-center gap-2">
                <UserGroupIcon className="w-5 h-5" />
                Watch Party
              </span>
              <div className={`absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-lg transition-transform duration-300 -z-10 ${
                pathname === '/watchparty' ? 'scale-100' : 'scale-0 group-hover:scale-100'
              }`}></div>
              <div className={`absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-300 ${
                pathname === '/watchparty' ? 'w-full' : 'w-0 group-hover:w-full'
              }`}></div>
            </Link>
          </nav>
          </div>

          {/* Mi lista y Search Section - Derecha */}
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            {/* Mi lista */}
            <Link
              href="/mi-lista"
              className="relative p-3 text-white hover:text-red-400 transition-all duration-300 group"
              aria-label="Mi lista"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-full scale-0 group-hover:scale-100 transition-transform duration-300"></div>
              <div className="absolute inset-0 border border-white/10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <svg className="relative h-6 w-6 z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </Link>
            
            {/* Búsqueda */}
            {!isSearchOpen ? (
              <button
                onClick={() => setIsSearchOpen(true)}
                className="relative p-3 text-white hover:text-red-400 transition-all duration-300 group"
                aria-label="Abrir búsqueda"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-full scale-0 group-hover:scale-100 transition-transform duration-300"></div>
                <div className="absolute inset-0 border border-white/10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <MagnifyingGlassIcon className="relative h-6 w-6 z-10" />
              </button>
            ) : (
              <div ref={searchRef} className="relative">
                <form onSubmit={handleSearch} className="relative">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-gray-900/80 to-black/80 rounded-full backdrop-blur-sm border border-white/20"></div>
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="Buscar películas, series..."
                      value={searchQuery}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      onFocus={() => {
                        if (searchResults.length > 0) {
                          setShowDropdown(true);
                        }
                      }}
                      className="relative bg-transparent border-0 rounded-full px-4 py-3 pl-12 pr-12 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all w-80 z-10"
                      autoFocus
                    />
                    <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-300 z-20" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsSearchOpen(false);
                        setSearchQuery('');
                        setShowDropdown(false);
                        setSearchResults([]);
                      }}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-300 hover:text-white transition-colors z-20 p-1 rounded-full hover:bg-white/10"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                </form>

                {/* Dropdown de resultados */}
                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-3 bg-gradient-to-b from-black/90 to-gray-900/90 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl shadow-black/50 z-50 max-h-96 overflow-y-auto">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent rounded-2xl pointer-events-none"></div>
                    {isSearching && (
                      <div className="p-4 text-center text-gray-400">
                        Buscando...
                      </div>
                    )}
                    
                    {!isSearching && searchResults.length > 0 && (
                      <>
                        {searchResults.map((item, index) => (
                          <div
                            key={`${item.media_type}-${item.id}`}
                            className={`relative p-4 cursor-pointer border-b border-white/10 last:border-b-0 hover:bg-white/5 transition-all duration-300 ${
                              selectedIndex === index ? 'bg-white/10' : ''
                            }`}
                            onClick={() => navigateToItem(item)}
                          >
                            <div className="flex items-start space-x-4">
                              <div className="relative flex-shrink-0">
                                <img
                                  src={getImageUrl(item.poster_path, 'w342')}
                                  alt={item.media_type === 'movie' ? item.title : item.name}
                                  className="w-12 h-16 object-cover rounded-lg shadow-lg"
                                  onError={(e) => {
                                    e.currentTarget.src = '/placeholder-poster.jpg';
                                  }}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-white truncate text-sm">
                                  {item.media_type === 'movie' ? item.title : item.name}
                                </h4>
                                <p className="text-sm text-gray-300 mt-1">
                                  {item.media_type === 'movie' ? 'Película' : 'Serie'} • {
                                    item.media_type === 'movie' 
                                      ? item.release_date?.split('-')[0] || 'N/A'
                                      : item.first_air_date?.split('-')[0] || 'N/A'
                                  }
                                </p>
                                <p className="text-xs text-gray-400 mt-2 line-clamp-2 leading-relaxed">
                                  {item.overview}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        <div
                          className={`relative p-4 cursor-pointer text-center text-red-400 hover:bg-white/5 border-t border-white/10 transition-all duration-300 ${
                            selectedIndex === searchResults.length ? 'bg-white/10' : ''
                          }`}
                          onClick={() => handleSearch({ preventDefault: () => {} } as any)}
                        >
                          <span className="font-medium">Ver todos los resultados</span>
                        </div>
                      </>
                    )}
                    
                    {!isSearching && searchResults.length === 0 && searchQuery.trim() && (
                      <div className="p-4 text-center text-gray-400">
                        No se encontraron resultados
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden ml-auto">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="relative text-white hover:text-red-400 transition-all duration-300 p-3 group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-lg scale-0 group-hover:scale-100 transition-transform duration-300"></div>
              <div className="absolute inset-0 border border-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              {isMenuOpen ? (
                <XMarkIcon className="relative h-6 w-6 z-10" />
              ) : (
                <Bars3Icon className="relative h-6 w-6 z-10" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden bg-gradient-to-b from-black/95 to-gray-900/90 border-t border-white/10 backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
            <div className="px-2 pt-2 pb-3 space-y-1">
              <Link
                href="/"
                className={`block px-3 py-2 rounded-md transition-colors font-medium text-base uppercase ${
                  pathname === '/' 
                    ? 'text-red-400 bg-red-500/10' 
                    : 'text-white hover:text-red-400 hover:bg-gray-800/50'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                Inicio
              </Link>
              <Link
                href="/movies"
                className={`block px-3 py-2 rounded-md transition-colors font-medium text-base uppercase ${
                  pathname === '/movies' 
                    ? 'text-red-400 bg-red-500/10' 
                    : 'text-white hover:text-red-400 hover:bg-gray-800/50'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                Películas
              </Link>
              <Link
                href="/tv"
                className={`block px-3 py-2 rounded-md transition-colors font-medium text-base uppercase ${
                  pathname === '/tv' 
                    ? 'text-red-400 bg-red-500/10' 
                    : 'text-white hover:text-red-400 hover:bg-gray-800/50'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                Series
              </Link>
              <Link
                href="/anime"
                className={`block px-3 py-2 rounded-md transition-colors font-medium text-base uppercase ${
                  pathname === '/anime' 
                    ? 'text-red-400 bg-red-500/10' 
                    : 'text-white hover:text-red-400 hover:bg-gray-800/50'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                Anime
              </Link>
              <Link
                href="/mi-lista"
                className={`block px-3 py-2 rounded-md transition-colors font-medium text-base uppercase ${
                  pathname === '/mi-lista' 
                    ? 'text-red-400 bg-red-500/10' 
                    : 'text-white hover:text-red-400 hover:bg-gray-800/50'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  Mi lista
                </span>
              </Link>
              <Link
                href="/watchparty"
                className={`block px-3 py-2 rounded-md transition-colors font-medium text-base uppercase ${
                  pathname === '/watchparty' 
                    ? 'text-red-400 bg-red-500/10' 
                    : 'text-white hover:text-red-400 hover:bg-gray-800/50'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                <span className="flex items-center gap-2">
                  <UserGroupIcon className="w-5 h-5" />
                  Watch Party
                </span>
              </Link>
              
              {/* Mobile Search */}
              <div className="px-3 py-2">
                <form onSubmit={handleSearch} className="relative">
                  <input
                    type="text"
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={handleInputChange}
                    className="w-full bg-gray-900 border border-gray-600 rounded-full px-4 py-2 pl-10 text-white placeholder-gray-400 focus:outline-none focus:border-gray-500 focus:bg-black transition-all"
                  />
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}