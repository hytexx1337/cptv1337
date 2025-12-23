// Sistema de gestión de "Mi lista"
export interface WatchlistItem {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  addedAt: number;
}

const WATCHLIST_KEY = 'movie-catalog-watchlist';

export function getWatchlist(): WatchlistItem[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(WATCHLIST_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading watchlist:', error);
    return [];
  }
}

export function addToWatchlist(item: Omit<WatchlistItem, 'addedAt'>): void {
  const watchlist = getWatchlist();
  
  // Verificar si ya existe
  if (watchlist.some(w => w.id === item.id && w.type === item.type)) {
    return;
  }
  
  const newItem: WatchlistItem = {
    ...item,
    addedAt: Date.now()
  };
  
  watchlist.unshift(newItem); // Agregar al principio
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
  
  // Disparar evento personalizado para actualizar UI
  window.dispatchEvent(new CustomEvent('watchlistUpdated'));
}

export function removeFromWatchlist(id: number, type: 'movie' | 'tv'): void {
  const watchlist = getWatchlist();
  const filtered = watchlist.filter(item => !(item.id === id && item.type === type));
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(filtered));
  
  // Disparar evento personalizado
  window.dispatchEvent(new CustomEvent('watchlistUpdated'));
}

export function isInWatchlist(id: number, type: 'movie' | 'tv'): boolean {
  const watchlist = getWatchlist();
  return watchlist.some(item => item.id === id && item.type === type);
}

export function toggleWatchlist(item: Omit<WatchlistItem, 'addedAt'>): boolean {
  const inList = isInWatchlist(item.id, item.type);
  
  if (inList) {
    removeFromWatchlist(item.id, item.type);
    return false;
  } else {
    addToWatchlist(item);
    return true;
  }
}
