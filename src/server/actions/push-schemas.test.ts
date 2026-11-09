import { describe, expect, it } from 'vitest';
import { subscribePushSchema, unsubscribePushSchema } from './push-schemas';

/**
 * Frontera de entrada de las Server Actions de push (spec 002, T-08;
 * constitución §4): entradas inválidas, campos ausentes y valores fuera de
 * rango se rechazan con un mensaje en español antes de llegar al servicio.
 */

/** Forma de `PushSubscription.toJSON()` en el navegador. */
const validSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123:APA91b-xyz',
  expirationTime: null,
  keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
};

function firstError(result: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return result.error?.issues[0]?.message ?? '';
}

describe('subscribePushSchema', () => {
  it('acepta la suscripción tal como la serializa el navegador y descarta campos extra', () => {
    const parsed = subscribePushSchema.parse({ ...validSubscription, userId: 'otra-persona' });
    expect(parsed).toEqual({ endpoint: validSubscription.endpoint, keys: validSubscription.keys });
    expect('userId' in parsed).toBe(false);
    expect('expirationTime' in parsed).toBe(false);
  });

  it('exige un endpoint https sin credenciales', () => {
    for (const endpoint of ['http://push.example/x', 'javascript:alert(1)', 'https://user:pass@push.example/x', 'no es una url', '']) {
      const result = subscribePushSchema.safeParse({ ...validSubscription, endpoint });
      expect(result.success).toBe(false);
      expect(firstError(result)).toBe('El dispositivo no ha dado una dirección de avisos válida.');
    }
  });

  it('solo acepta endpoints de servicios push conocidos (SSRF)', () => {
    const internal = [
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/x',
      'https://127.0.0.1/x',
      'https://intranet.corp/x',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evil.example/fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://push.apple.com/x',
    ];
    for (const endpoint of internal) {
      expect(subscribePushSchema.safeParse({ ...validSubscription, endpoint }).success, endpoint).toBe(false);
      expect(unsubscribePushSchema.safeParse({ endpoint }).success, endpoint).toBe(false);
    }
    const allowed = [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/abc',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ];
    for (const endpoint of allowed) {
      expect(subscribePushSchema.safeParse({ ...validSubscription, endpoint }).success, endpoint).toBe(true);
    }
  });

  it('limita la longitud del endpoint', () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${'a'.repeat(1000)}`;
    expect(subscribePushSchema.safeParse({ ...validSubscription, endpoint }).success).toBe(false);
  });

  it('exige las dos claves en base64url y con longitud razonable', () => {
    const bad = [
      { p256dh: '', auth: 'abc' },
      { p256dh: 'abc', auth: '' },
      { p256dh: 'con espacios', auth: 'abc' },
      { p256dh: 'abc', auth: '<script>' },
      { p256dh: 'a'.repeat(201), auth: 'abc' },
      { p256dh: 'abc', auth: 'a'.repeat(101) },
    ];
    for (const keys of bad) {
      const result = subscribePushSchema.safeParse({ ...validSubscription, keys });
      expect(result.success).toBe(false);
      expect(firstError(result)).toBe('Las claves de cifrado del dispositivo no son válidas.');
    }
  });

  it('rechaza campos ausentes o de otro tipo', () => {
    expect(subscribePushSchema.safeParse({}).success).toBe(false);
    expect(subscribePushSchema.safeParse({ endpoint: validSubscription.endpoint }).success).toBe(false);
    expect(subscribePushSchema.safeParse({ ...validSubscription, keys: 'texto' }).success).toBe(false);
    expect(subscribePushSchema.safeParse(null).success).toBe(false);
  });
});

describe('unsubscribePushSchema', () => {
  it('solo necesita el endpoint y descarta lo demás', () => {
    expect(unsubscribePushSchema.parse({ endpoint: validSubscription.endpoint, userId: 'x' })).toEqual({
      endpoint: validSubscription.endpoint,
    });
  });

  it('rechaza un endpoint no https o ausente', () => {
    expect(unsubscribePushSchema.safeParse({ endpoint: 'http://push.example/x' }).success).toBe(false);
    expect(unsubscribePushSchema.safeParse({}).success).toBe(false);
  });
});
