'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from './LanguageContext';

export default function BottomNav() {
  const pathname = usePathname();
  const { t } = useLanguage();

  const navItems = [
    { href: '/', label: t('home'), icon: 'directions_bus' },
    { href: '/track', label: t('liveTrack'), icon: 'fmd_good' },
    { href: '/routes', label: t('routes'), icon: 'alt_route' },
    { href: '/radar', label: t('radar'), icon: 'radar' },
    { href: '/timetable', label: t('timetable'), icon: 'schedule' },
    { href: '/about', label: t('about'), icon: 'info' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-surface-container shadow-[0_-8px_24px_rgba(14,28,47,0.06)]">
      <div className="max-w-2xl mx-auto h-16 px-2 flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)) || (item.href === '/' && pathname === '/search');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-all relative ${
                isActive
                  ? 'text-primary font-bold'
                  : 'text-on-surface-variant hover:text-on-surface font-medium'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[22px] transition-transform ${
                  isActive ? 'scale-110' : ''
                }`}
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {item.icon}
              </span>
              <span className="text-[11px] mt-0.5 tracking-tight truncate max-w-[58px]">
                {item.label}
              </span>
              {isActive && (
                <span className="absolute bottom-1 w-6 h-1 bg-primary rounded-full shadow-[0_0_8px_rgba(0,72,212,0.8)]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
