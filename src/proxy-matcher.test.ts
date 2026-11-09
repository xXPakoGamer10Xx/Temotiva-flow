import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Qué rutas pasan por la protección de sesión de `proxy.ts` (spec 002 RF-02,
 * T-10). Se lee el matcher del archivo para no importar Auth.js en el test.
 */
function matcher(): RegExp {
  const source = readFileSync(join(process.cwd(), 'src', 'proxy.ts'), 'utf8');
  const literal = /matcher:\s*\[\s*'([^']+)'\s*\]/.exec(source)?.[1];
  if (!literal) throw new Error('No se encontró el matcher en proxy.ts');
  // El patrón de Next usa la sintaxis de path-to-regexp con un grupo regex: se ancla igual.
  return new RegExp(`^${literal.replace(/\\\\/g, '\\')}$`);
}

const protects = (path: string): boolean => matcher().test(path);

describe('matcher de proxy.ts', () => {
  it('sigue protegiendo las vistas y las API de la app', () => {
    for (const path of ['/board', '/notifications', '/dependencias', '/api/documents/1', '/api/attachments/x', '/']) {
      expect(protects(path)).toBe(true);
    }
  });

  it('deja pasar sin sesión lo que el navegador pide para instalar y lo que llama el crontab', () => {
    for (const path of ['/manifest.webmanifest', '/sw.js', '/offline', '/icons/icon-192.png', '/api/cron/sle-risk']) {
      expect(protects(path)).toBe(false);
    }
  });

  it('conserva las exclusiones que ya existían', () => {
    for (const path of ['/api/auth/session', '/api/mcp', '/_next/static/x.js', '/_next/image', '/favicon.ico', '/brand/temotiva-brain.png']) {
      expect(protects(path)).toBe(false);
    }
  });

  it('no abre por accidente rutas que solo empiezan igual', () => {
    for (const path of ['/offline-data', '/sw.json', '/api/cronjobs']) {
      expect(protects(path)).toBe(true);
    }
  });
});
