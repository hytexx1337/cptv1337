'use client';

import { useState } from 'react';
import { UserGroupIcon } from '@heroicons/react/24/solid';

interface WatchPartyButtonProps {
  onClick: () => void;
  isActive: boolean;
  userCount?: number;
}

export default function WatchPartyButton({ onClick, isActive, userCount }: WatchPartyButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
        isActive
          ? 'bg-blue-600 text-white'
          : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700 hover:text-white'
      }`}
      title="Watch Party"
    >
      <UserGroupIcon className="w-5 h-5" />
      <span className="hidden sm:inline">Watch Party</span>
      {userCount !== undefined && userCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {userCount}
        </span>
      )}
    </button>
  );
}

