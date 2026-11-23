'use client';

import React from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageContext';

export default function AboutPage() {
  const { lang, t } = useLanguage();

  return (
    <div className="flex flex-col w-full pb-10">
      {/* Friendly Header Section */}
      <section className="px-4 pt-4 pb-3 flex flex-col items-center text-center gap-2">
        <div className="w-16 h-16 rounded-3xl bg-primary text-on-primary flex items-center justify-center shadow-lg mb-1">
          <span className="material-symbols-outlined text-[36px]">directions_bus</span>
        </div>

        <div className="flex items-center justify-center gap-2">
          <h1 className="text-2xl font-extrabold text-on-surface">AgliBus • अगलीबस</h1>
          <span className="px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-xs font-bold">
            v2.4
          </span>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-xs font-bold shadow-xs">
          <span className="material-symbols-outlined text-[16px]">location_on</span>
          <span>{lang === 'hi' ? 'Made for Udaipur • उदयपुर स्मार्ट सिटी' : 'Made for Udaipur • Smart City Transit'}</span>
        </div>

        <p className="text-sm text-on-surface-variant max-w-sm mt-1 leading-relaxed">
          {lang === 'hi'
            ? 'आपकी अपनी उदयपुर सिटी बस सेवा की सरल, सटीक और लाइव जानकारी।'
            : 'Reliable, real-time public transit tracking for Udaipur City Bus and PM e-Bus.'}
        </p>
      </section>

      {/* 3-Point Core Features */}
      <section className="px-4 py-2 flex flex-col gap-2.5">
        <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider px-1">
          {t('featuresTitle')}
        </h2>

        {/* Feature 1 */}
        <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[26px]">verified</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-extrabold text-[15px] text-on-surface">{t('feature1Title')}</span>
            <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
              {t('feature1Desc')}
            </p>
          </div>
        </div>

        {/* Feature 2 */}
        <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center text-primary shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[26px]">directions_bus</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-extrabold text-[15px] text-on-surface">{t('feature2Title')}</span>
            <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
              {t('feature2Desc')}
            </p>
          </div>
        </div>

        {/* Feature 3 */}
        <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center text-secondary shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[26px]">touch_app</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-extrabold text-[15px] text-on-surface">{t('feature3Title')}</span>
            <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
              {t('feature3Desc')}
            </p>
          </div>
        </div>
      </section>

      {/* Emergency & Helpline Section */}
      <section className="px-4 py-2 flex flex-col gap-2.5">
        <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider px-1">
          {t('helplineTitle')}
        </h2>

        <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-surface-container">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">call</span>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm text-on-surface">{lang === 'hi' ? 'UCTSL सिटी बस डिपो' : 'UCTSL City Bus Depot'}</span>
                <span className="text-xs text-on-surface-variant">{lang === 'hi' ? 'बलारिया बाईपास / तितरड़ी' : 'Balicha Bypass / Titrdi'}</span>
              </div>
            </div>
            <a
              href="tel:02942411234"
              className="px-3 py-1.5 rounded-xl bg-primary text-on-primary font-bold text-xs"
            >
              {lang === 'hi' ? 'कॉल करें' : 'Call'}
            </a>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">support_agent</span>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm text-on-surface">{lang === 'hi' ? 'स्मार्ट सिटी हेल्पलाइन' : 'Smart City Helpline'}</span>
                <span className="text-xs text-on-surface-variant">{lang === 'hi' ? 'टोल फ्री नंबर' : 'Toll-free number'}</span>
              </div>
            </div>
            <a
              href="tel:18001802345"
              className="px-3 py-1.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs"
            >
              1800-180-2345
            </a>
          </div>
        </div>
      </section>

      {/* Standard Fare Chart */}
      <section className="px-4 py-2 flex flex-col gap-2.5">
        <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider px-1">
          {t('fareChart')}
        </h2>

        <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 grid grid-cols-4 gap-2 text-center">
          <div className="p-2.5 rounded-xl bg-surface-container-low">
            <span className="text-xs text-on-surface-variant font-bold">0 - 4 {t('km')}</span>
            <span className="block text-base font-extrabold text-primary mt-0.5">₹5</span>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-container-low">
            <span className="text-xs text-on-surface-variant font-bold">4 - 8 {t('km')}</span>
            <span className="block text-base font-extrabold text-primary mt-0.5">₹10</span>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-container-low">
            <span className="text-xs text-on-surface-variant font-bold">8 - 14 {t('km')}</span>
            <span className="block text-base font-extrabold text-primary mt-0.5">₹15</span>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-container-low">
            <span className="text-xs text-on-surface-variant font-bold">14+ {t('km')}</span>
            <span className="block text-base font-extrabold text-primary mt-0.5">₹20</span>
          </div>
        </div>
      </section>
    </div>
  );
}
