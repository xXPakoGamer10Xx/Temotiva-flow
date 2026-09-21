import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Temotiva Flow',
    template: '%s · Temotiva Flow',
  },
  description:
    'Sistema interno de gestión, trazabilidad y coordinación del flujo de iniciativas interdisciplinares de Temotiva.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f9fa' },
    { media: '(prefers-color-scheme: dark)', color: '#16191d' },
  ],
};

/**
 * Se aplica el tema antes de pintar para evitar el parpadeo de color al cargar.
 * Es el único script inline del proyecto y no toca datos.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('temotiva-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (stored !== 'light' && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (error) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
