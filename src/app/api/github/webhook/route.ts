import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDataStore } from '@/server/repositories';
import { parsePullRequestPayload, syncPullRequest } from '@/server/services/github-sync';

/**
 * Webhook de GitHub para el sprint de Tech.
 *
 * No usa la sesión de Google: GitHub firma cada entrega con HMAC-SHA256 del
 * cuerpo (`X-Hub-Signature-256`) usando `GITHUB_WEBHOOK_SECRET`. Fail-closed:
 * sin secreto no se procesa nada. Si `GITHUB_REPOSITORIES` tiene valor, solo se
 * aceptan esos repos (`owner/repo`, separados por comas). La respuesta solo
 * lleva recuentos, nunca títulos ni nombres.
 *
 * En GitHub: Settings → Webhooks → Add webhook
 *   Payload URL:  https://<host>/api/github/webhook
 *   Content type: application/json
 *   Secret:       el mismo valor que GITHUB_WEBHOOK_SECRET
 *   Events:       "Pull requests"
 */
export const dynamic = 'force-dynamic';

/** GitHub limita los payloads a 25 MB; un pull_request real no pasa de unos cientos de KB. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const NO_STORE = { 'Cache-Control': 'no-store' };

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** Firma válida en tiempo constante. */
export function validSignature(body: string, header: string | null, secret: string): boolean {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header ?? '');
  if (!match?.[1]) return false;
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest();
  const given = Buffer.from(match[1], 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Lee el cuerpo como flujo y corta en cuanto pasa del tope; `null` = demasiado grande. */
export async function readLimited(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function allowedRepos(): Set<string> | null {
  const raw = process.env.GITHUB_REPOSITORIES?.trim();
  if (!raw) return null;
  return new Set(
    raw
      .split(',')
      .map((repo) => repo.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) return json({ error: 'La integración con GitHub no está configurada.' }, 503);

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ error: 'Carga demasiado grande.' }, 413);
  // Sin Content-Length (envío por trozos) el aviso de arriba no sirve: el tope se
  // aplica también mientras se lee, antes de tener el cuerpo entero en memoria.
  const body = await readLimited(request, MAX_BODY_BYTES);
  if (body === null) return json({ error: 'Carga demasiado grande.' }, 413);

  if (!validSignature(body, request.headers.get('x-hub-signature-256'), secret)) {
    return json({ error: 'Firma no válida.' }, 401);
  }

  const event = request.headers.get('x-github-event');
  if (event === 'ping') return json({ ok: true }, 200);
  if (event !== 'pull_request') return json({ ignored: true }, 202);

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return json({ error: 'JSON no válido.' }, 400);
  }
  const pullRequest = parsePullRequestPayload(payload);
  if (!pullRequest) return json({ ignored: true }, 202);

  const repos = allowedRepos();
  if (repos && !repos.has(pullRequest.repo.toLowerCase())) return json({ ignored: true }, 202);

  try {
    const result = await syncPullRequest(getDataStore(), pullRequest, new Date());
    return json({ ...result }, 200);
  } catch (error) {
    const kind = error instanceof Error ? error.name : 'desconocido';
    console.error(`[github] Falló la sincronización de un pull request (${kind}).`);
    return json({ error: 'No se ha podido sincronizar.' }, 500);
  }
}
