'use client';

import React from 'react';

export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-black text-white">
      {children}
    </main>
  );
}