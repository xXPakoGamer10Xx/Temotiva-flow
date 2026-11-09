import type { MetadataRoute } from 'next';

/**
 * Web App Manifest (spec 002 RF-01): lo que permite instalar Temotiva Flow en la
 * pantalla de inicio. Se sirve en `/manifest.webmanifest` sin sesión (RF-02).
 * Los colores son los del tema claro de `globals.css` (`--bg`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Temotiva Flow',
    short_name: 'TemoFlow',
    description: 'Gestión, trazabilidad y coordinación de iniciativas interdisciplinares de Temotiva.',
    lang: 'es',
    dir: 'ltr',
    start_url: '/board',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f6fb',
    theme_color: '#f7f6fb',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
