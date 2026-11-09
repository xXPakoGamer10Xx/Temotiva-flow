import { describe, expect, it } from 'vitest';
import { describeDevice, pushCardState, urlBase64ToUint8Array } from './push-device-state';

/** Estados de la tarjeta «Avisos en este dispositivo» (spec 002 RF-05, RF-06; T-12). */

const ready = { supported: true, isIos: false, standalone: false, hasKey: true, permission: 'default' as const, subscribed: false };

describe('pushCardState', () => {
  it('sin API de push: no compatible', () => {
    expect(pushCardState({ ...ready, supported: false })).toBe('unsupported');
  });

  it('iPhone/iPad sin instalar: primero hay que instalar la app', () => {
    expect(pushCardState({ ...ready, supported: false, isIos: true })).toBe('ios-install');
    expect(pushCardState({ ...ready, isIos: true })).toBe('ios-install');
  });

  it('iPhone/iPad instalada: se comporta como cualquier otro', () => {
    expect(pushCardState({ ...ready, isIos: true, standalone: true })).toBe('inactive');
  });

  it('sin clave pública configurada: no disponible en este entorno (CA-11)', () => {
    expect(pushCardState({ ...ready, hasKey: false })).toBe('unavailable');
    expect(pushCardState({ ...ready, hasKey: false, subscribed: true })).toBe('unavailable');
  });

  it('permiso bloqueado en el navegador', () => {
    expect(pushCardState({ ...ready, permission: 'denied' })).toBe('blocked');
  });

  it('sin suscripción: ofrece activar; con suscripción y permiso: activado', () => {
    expect(pushCardState(ready)).toBe('inactive');
    expect(pushCardState({ ...ready, permission: 'granted' })).toBe('inactive');
    expect(pushCardState({ ...ready, permission: 'granted', subscribed: true })).toBe('active');
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodifica base64url sin relleno, como entrega web-push las claves', () => {
    expect([...urlBase64ToUint8Array('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });
});

describe('describeDevice', () => {
  it('resume el navegador y el sistema sin exponer la cadena completa', () => {
    expect(
      describeDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'),
    ).toBe('Chrome en Android');
    expect(
      describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'),
    ).toBe('Safari en iPhone');
    expect(
      describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'),
    ).toBe('Edge en Windows');
    expect(describeDevice('algo raro')).toBe('este navegador');
  });
});
