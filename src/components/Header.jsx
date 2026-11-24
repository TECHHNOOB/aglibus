'use client';

import React from 'react';
import Link from 'next/link';
import { useLanguage } from './LanguageContext';

export default function Header() {
  const { lang, toggleLang, t } = useLanguage();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-md border-b border-surface-container-high/60 transition-colors">
      <div className="max-w-2xl mx-auto h-16 px-4 flex items-center justify-between">
        {/* Official Brand Logo */}
        <Link href="/" className="flex items-center gap-2 min-w-0 group py-1">
          <img
            src="/logo.png"
            alt="AgliBus Official Logo"
            className="h-9 sm:h-10 w-auto object-contain max-w-[175px] sm:max-w-[210px] transition-transform group-hover:scale-105"
          />
          <span className="px-1.5 py-0.2 rounded-full bg-secondary-fixed text-on-secondary-fixed text-[10px] font-extrabold uppercase tracking-wider shrink-0">
            Live
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {/* High-visibility Bilingual Toggle Pill */}
          <button
            onClick={toggleLang}
            type="button"
            className="flex items-center p-1 rounded-xl bg-surface-container border border-outline-variant/30 active:scale-95 transition-all shadow-xs"
            title="Switch Language / भाषा बदलें"
          >
            <span
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                lang === 'hi'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              हिन्दी
            </span>
            <span
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                lang === 'en'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              EN
            </span>
          </button>

          {/* Quick Refresh */}
          <button
            onClick={() => window.location.reload()}
            aria-label="Refresh data"
            className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary active:scale-90 transition-all border border-outline-variant/30"
          >
            <span className="material-symbols-outlined text-[19px]">refresh</span>
          </button>
        </div>
      </div>
    </header>
  );
}
