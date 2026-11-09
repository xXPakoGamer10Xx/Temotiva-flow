import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from './manifest';

/** Web App Manifest (spec 002 RF-01, T-10). */
describe('manifest', () => {
  const m = manifest();

  it('identifica la app en español y se abre a pantalla completa en el tablero', () => {
    expect(m).toMatchObject({
      name: 'Temotiva Flow',
      short_name: 'TemoFlow',
      lang: 'es',
      dir: 'ltr',
      display: 'standalone',
      start_url: '/board',
      scope: '/',
      id: '/',
    });
    expect(m.description).toMatch(/iniciativas/);
  });

  it('usa los colores del sistema visual (tema claro)', () => {
    expect(m.background_color).toBe('#f7f6fb');
    expect(m.theme_color).toBe('#f7f6fb');
  });

  it('declara iconos de 192 y 512, uno maskable, y todos existen en public/', () => {
    const icons = m.icons ?? [];
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    for (const icon of icons) {
      expect(icon.type).toBe('image/png');
      expect(existsSync(join(process.cwd(), 'public', icon.src))).toBe(true);
    }
  });
});
