import { describe, expect, it } from 'vitest';
import { detectInstallMode } from './install-store';

/** Qué ofrece el botón «Descargar app» en cada navegador (spec 002 RF-05a, T-11b). */

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1',
  // iPadOS se presenta como un Mac de escritorio; se distingue por la pantalla táctil.
  ipadSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  firefoxDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
};

const base = { standalone: false, hasPrompt: false, maxTouchPoints: 0 };

describe('detectInstallMode', () => {
  it('Chrome/Edge/Android con el evento de instalación → diálogo nativo', () => {
    expect(detectInstallMode({ ...base, userAgent: UA.chromeWindows, hasPrompt: true })).toBe('native');
    expect(detectInstallMode({ ...base, userAgent: UA.chromeAndroid, hasPrompt: true })).toBe('native');
  });

  it('Chrome antes de que llegue el evento (o si ya se instaló por otra vía) → nada todavía', () => {
    expect(detectInstallMode({ ...base, userAgent: UA.chromeWindows })).toBe('unsupported');
  });

  it('iPhone y iPad (Safari o Chrome) → pasos manuales', () => {
    expect(detectInstallMode({ ...base, userAgent: UA.iphoneSafari, maxTouchPoints: 5 })).toBe('ios');
    expect(detectInstallMode({ ...base, userAgent: UA.iphoneChrome, maxTouchPoints: 5 })).toBe('ios');
    expect(detectInstallMode({ ...base, userAgent: UA.ipadSafari, maxTouchPoints: 5 })).toBe('ios');
  });

  it('Safari de Mac sin pantalla táctil no es iOS', () => {
    expect(detectInstallMode({ ...base, userAgent: UA.macSafari, maxTouchPoints: 0 })).toBe('unsupported');
  });

  it('dentro de la app instalada el botón no aparece, en ningún sistema', () => {
    for (const userAgent of Object.values(UA)) {
      expect(detectInstallMode({ ...base, userAgent, standalone: true, hasPrompt: true, maxTouchPoints: 5 })).toBe('installed');
    }
  });

  it('Firefox de escritorio no tiene vía de instalación', () => {
    expect(detectInstallMode({ ...base, userAgent: UA.firefoxDesktop })).toBe('unsupported');
  });
});
