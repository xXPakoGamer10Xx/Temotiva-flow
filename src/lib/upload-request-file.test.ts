import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRequestUpload, uploadRequestFile } from './upload-request-file';

/** Subida de archivos a una petición (spec 001, ampliación A, T-15). */

const file = (name: string, size = 10): File => new File([new Uint8Array(size)], name);
const REQUEST_ID = '7a1c2e4e-8b3d-4c5e-9f70-1a2b3c4d5e6f';

describe('checkRequestUpload', () => {
  it.each(['acta.pdf', 'acta.DOCX', 'captura.png', 'foto.jpg', 'foto.jpeg', 'imagen.webp'])('acepta %s a primera vista', (name) => {
    expect(checkRequestUpload(file(name))).toBeNull();
  });

  it.each(['animacion.gif', 'script.svg', 'hoja.xlsx', 'programa.exe', 'sin-extension'])('rechaza %s', (name) => {
    expect(checkRequestUpload(file(name))).toMatch(/Solo se admiten/);
  });

  it('rechaza archivos de más de 4 MB', () => {
    expect(checkRequestUpload(file('grande.pdf', 4 * 1024 * 1024 + 1))).toBe('El archivo supera 4 MB.');
  });
});

describe('uploadRequestFile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('envía archivo y lado a la ruta de la petición y devuelve null si fue bien', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { id: 'x' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await uploadRequestFile(REQUEST_ID, 'RESPONSE', file('acta.pdf'))).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/department-requests/${REQUEST_ID}/attachments`);
    expect(init.method).toBe('POST');
    const body = init.body as FormData;
    expect(body.get('side')).toBe('RESPONSE');
    expect((body.get('file') as File).name).toBe('acta.pdf');
  });

  it('devuelve el mensaje del servidor si la subida falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, message: 'El archivo supera 4 MB.' }), { status: 400 })));
    expect(await uploadRequestFile(REQUEST_ID, 'REQUEST', file('acta.pdf'))).toBe('El archivo supera 4 MB.');
  });

  it('no llama al servidor si el archivo no pasa la comprobación previa', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await uploadRequestFile(REQUEST_ID, 'REQUEST', file('virus.exe'))).toMatch(/Solo se admiten/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
