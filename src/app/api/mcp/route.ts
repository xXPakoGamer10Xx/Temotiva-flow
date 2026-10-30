import { NextResponse } from 'next/server';
import { getDataStore } from '@/server/repositories';
import { handleMcpMessage } from '@/server/mcp/handler';
import { resolveApiToken } from '@/server/services/api-tokens';

/**
 * Endpoint MCP (Model Context Protocol) para que un cliente de IA consulte
 * Temotiva Flow. No usa la cookie de Google: autentica con un token personal
 * (`Authorization: Bearer tfm_…`) que se resuelve contra la lista de acceso en
 * cada petición. Sin token válido no hay nada: fail-closed.
 */
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };

function unauthorized(): NextResponse {
  return NextResponse.json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Token ausente, caducado o revocado.' } },
    { status: 401, headers: { ...NO_STORE, 'WWW-Authenticate': 'Bearer realm="temotiva-flow"' } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  const store = getDataStore();
  const token = match?.[1];
  const session = token ? await resolveApiToken(store, token) : null;
  if (!session) return unauthorized();

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Petición demasiado grande.' } }, { status: 413, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON no válido.' } }, { status: 400, headers: NO_STORE });
  }

  const messages = Array.isArray(body) ? body : [body];
  const responses = (await Promise.all(messages.map((message) => handleMcpMessage(store, session, message)))).filter(
    (response) => response !== null,
  );

  if (responses.length === 0) return new NextResponse(null, { status: 202, headers: NO_STORE });
  return NextResponse.json(Array.isArray(body) ? responses : responses[0], { headers: NO_STORE });
}

/** Sin sesiones ni streaming de servidor: el cliente solo usa POST. */
export function GET(): NextResponse {
  return new NextResponse(null, { status: 405, headers: { ...NO_STORE, Allow: 'POST' } });
}
