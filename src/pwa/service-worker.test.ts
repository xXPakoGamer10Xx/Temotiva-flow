import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

/**
 * Service worker `public/sw.js` (spec 002 RF-03, RF-04, RF-15; T-11).
 *
 * Se ejecuta el archivo real en un contexto aislado con un `self` simulado, y
 * se disparan sus eventos como lo haría el navegador. Sin red ni navegador.
 */

const ORIGIN = 'https://flow.example';
const SOURCE = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');

type Handler = (event: Record<string, unknown>) => void;

function load(options: { fetchImpl?: (input: Request | string) => Promise<Response> } = {}) {
  const handlers = new Map<string, Handler>();
  const stores = new Map<string, Map<string, Response>>();

  const cacheFor = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    const key = (request: Request | string) => new URL(typeof request === 'string' ? request : request.url, ORIGIN).pathname;
    return {
      addAll: vi.fn(async (urls: string[]) => {
        for (const url of urls) store.set(key(url), new Response(`cached ${url}`));
      }),
      put: vi.fn(async (request: Request | string, response: Response) => {
        store.set(key(request), response);
      }),
      match: vi.fn(async (request: Request | string) => store.get(key(request))?.clone()),
    };
  };

  const caches = {
    open: vi.fn(async (name: string) => cacheFor(name)),
    keys: vi.fn(async () => [...stores.keys()]),
    delete: vi.fn(async (name: string) => stores.delete(name)),
    match: vi.fn(async (request: Request | string) => {
      for (const name of stores.keys()) {
        const hit = await cacheFor(name).match(request);
        if (hit) return hit;
      }
      return undefined;
    }),
  };

  const windows: { url: string; focused: boolean; navigate: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }[] = [];
  const clients = {
    claim: vi.fn(async () => {}),
    matchAll: vi.fn(async () => windows),
    openWindow: vi.fn(async (_url: string) => null),
  };

  const registration = { showNotification: vi.fn(async (_title: string, _options: Record<string, unknown>) => {}) };

  const fetchImpl =
    options.fetchImpl ??
    (async (input: Request | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/offline')) {
        return new Response('<html><head><link rel="stylesheet" href="/_next/static/chunks/app.css"/></head></html>', {
          headers: { 'content-type': 'text/html' },
        });
      }
      return new Response(`network ${url}`);
    });

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(async () => {}),
    registration,
    clients,
  };

  runInNewContext(SOURCE, {
    self,
    caches,
    clients,
    fetch: vi.fn(fetchImpl),
    Response,
    Request,
    URL,
    Promise,
    JSON,
    console,
  });

  /** Dispara un evento y espera a lo que el handler pase a waitUntil/respondWith. */
  async function dispatch(type: string, event: Record<string, unknown> = {}) {
    const pending: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    handlers.get(type)?.({
      ...event,
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      respondWith: (promise: Promise<Response>) => {
        responded = Promise.resolve(promise);
      },
    });
    await Promise.all(pending);
    return responded ? await responded : undefined;
  }

  return { handlers, stores, caches, clients, windows, registration, self, dispatch };
}

function navigation(path: string): Request {
  return { url: `${ORIGIN}${path}`, mode: 'navigate', method: 'GET' } as unknown as Request;
}

function asset(path: string, method = 'GET'): Request {
  return { url: `${ORIGIN}${path}`, mode: 'no-cors', method } as unknown as Request;
}

describe('instalación y activación', () => {
  it('precachea solo la página sin conexión, sus estilos y los recursos de marca', async () => {
    const sw = load();
    await sw.dispatch('install');

    const cached = [...sw.stores.values()].flatMap((store) => [...store.keys()]).sort();
    expect(cached).toEqual(
      [
        '/_next/static/chunks/app.css',
        '/brand/cerebrin-saludando.png',
        '/icons/badge-72.png',
        '/icons/icon-192.png',
        '/offline',
      ].sort(),
    );
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it('al activarse borra las cachés de versiones anteriores y toma el control', async () => {
    const sw = load();
    sw.stores.set('temoflow-viejo', new Map());
    sw.stores.set('otra-app', new Map());
    await sw.dispatch('install');
    await sw.dispatch('activate');

    const names = [...sw.stores.keys()];
    expect(names).not.toContain('temoflow-viejo');
    expect(names).toContain('otra-app');
    expect(names.filter((name) => name.startsWith('temoflow-'))).toHaveLength(1);
    expect(sw.clients.claim).toHaveBeenCalled();
  });
});

describe('peticiones', () => {
  it('una navegación va a la red y, si falla, sirve la página sin conexión', async () => {
    const online = load();
    await online.dispatch('install');
    expect(await (await online.dispatch('fetch', { request: navigation('/board') }))?.text()).toBe(`network ${ORIGIN}/board`);

    const offline = load({
      fetchImpl: async (input) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/offline')) return new Response('<html></html>');
        throw new TypeError('Failed to fetch');
      },
    });
    await offline.dispatch('install');
    const response = await offline.dispatch('fetch', { request: navigation('/board') });
    expect(await response?.text()).toBe('<html></html>');
  });

  it('un recurso precacheado se sirve desde la caché solo si falla la red', async () => {
    const sw = load({
      fetchImpl: async (input) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/offline')) return new Response('<html><link rel="stylesheet" href="/_next/static/chunks/app.css"></html>');
        throw new TypeError('Failed to fetch');
      },
    });
    await sw.dispatch('install');
    const response = await sw.dispatch('fetch', { request: asset('/icons/icon-192.png') });
    expect(await response?.text()).toBe('cached /icons/icon-192.png');
  });

  it('no intercepta API, datos ni peticiones que no sean GET: nada de eso se cachea', async () => {
    const sw = load();
    await sw.dispatch('install');
    for (const request of [asset('/api/documents/1'), asset('/board?_rsc=abc'), asset('/icons/icon-192.png', 'POST'), asset('/_next/static/chunks/otro.js')]) {
      expect(await sw.dispatch('fetch', { request })).toBeUndefined();
    }
    const cached = [...sw.stores.values()].flatMap((store) => [...store.keys()]);
    expect(cached.some((path) => path.startsWith('/api/'))).toBe(false);
  });
});

describe('avisos push', () => {
  const payload = { kind: 'BLOCKED', title: '⛔ TEMO-012 está parada', body: 'Tech', url: '/board?iniciativa=TEMO-012', tag: 'BLOCKED:TEMO-012' };

  it('muestra el aviso con título, texto, tag, iconos y la URL de destino', async () => {
    const sw = load();
    await sw.dispatch('push', { data: { json: () => payload } });
    expect(sw.registration.showNotification).toHaveBeenCalledWith('⛔ TEMO-012 está parada', {
      body: 'Tech',
      tag: 'BLOCKED:TEMO-012',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      lang: 'es',
      data: { url: '/board?iniciativa=TEMO-012' },
    });
  });

  it('un push vacío o ilegible muestra un aviso genérico (los navegadores exigen mostrar algo)', async () => {
    for (const data of [undefined, { json: () => { throw new SyntaxError('x'); } }, { json: () => ({}) }]) {
      const sw = load();
      await sw.dispatch('push', { data });
      const [title, options] = sw.registration.showNotification.mock.calls[0] ?? [];
      expect(title).toBe('Temotiva Flow');
      expect(options).toMatchObject({ body: 'Tienes un aviso nuevo.', data: { url: '/notifications' } });
    }
  });

  it('una URL externa o rara en el payload se sustituye por /notifications', async () => {
    for (const url of ['https://malo.example/x', '//malo.example/x', 'javascript:alert(1)', '/\\malo.example', 42]) {
      const sw = load();
      await sw.dispatch('push', { data: { json: () => ({ ...payload, url }) } });
      expect(sw.registration.showNotification.mock.calls[0]?.[1]).toMatchObject({ data: { url: '/notifications' } });
    }
  });
});

describe('al tocar un aviso', () => {
  function click(url: unknown) {
    return { notification: { data: { url }, close: vi.fn() } };
  }

  it('si la app ya está abierta, navega en esa ventana y la enfoca', async () => {
    const sw = load();
    const navigate = vi.fn(async () => ({}));
    const focus = vi.fn(async () => ({}));
    sw.windows.push({ url: `${ORIGIN}/radar`, focused: false, navigate, focus });

    const event = click('/board?iniciativa=TEMO-012');
    await sw.dispatch('notificationclick', event);

    expect(event.notification.close).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(`${ORIGIN}/board?iniciativa=TEMO-012`);
    expect(focus).toHaveBeenCalled();
    expect(sw.clients.openWindow).not.toHaveBeenCalled();
  });

  it('si no está abierta, abre una ventana nueva en la URL del aviso', async () => {
    const sw = load();
    await sw.dispatch('notificationclick', click('/dependencias'));
    expect(sw.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/dependencias`);
  });

  it('nunca abre un origen ajeno', async () => {
    const sw = load();
    await sw.dispatch('notificationclick', click('https://malo.example/robar'));
    expect(sw.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/notifications`);
  });
});
