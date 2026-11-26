import './globals.css';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { LanguageProvider } from '@/components/LanguageContext';

export const metadata = {
  title: 'Udaipur City Bus Tracker',
  description: 'Live GPS bus tracking, route planning, timetable, and nearby radar for Udaipur City Transit & PM e-Bus.',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="hi">
      <body className="bg-surface text-on-surface antialiased selection:bg-primary-fixed selection:text-on-primary-fixed">
        <LanguageProvider>
          <div className="min-h-screen flex flex-col justify-between max-w-2xl mx-auto bg-surface shadow-2xl relative">
            <Header />
            <main className="flex-1 w-full pt-16 pb-20">
              {children}
            </main>
            <BottomNav />
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
