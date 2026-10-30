import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { ApiToken, SessionContext } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { forbidden, invalid, notFound } from './errors';

/**
 * Tokens personales para clientes de IA (MCP).
 *
 * Un token no es una identidad nueva: es una forma de que una persona de la
 * lista de acceso delegue su sesión en una herramienta. Al resolverlo se
 * vuelve a consultar `users`, así que una baja o un cambio de rol surten efecto
 * al instante, igual que con la sesión de Google (SEGURIDAD.md §3.2).
 */

export const API_TOKEN_PREFIX = 'tfm_';
export const MIN_API_TOKEN_NAME = 3;
export const MAX_API_TOKEN_NAME = 60;
export const MAX_API_TOKEN_DAYS = 90;
export const DEFAULT_API_TOKEN_DAYS = 30;
export const MAX_ACTIVE_API_TOKENS = 5;

/** Para no escribir en la BD en cada llamada, `lastUsedAt` se refresca como mucho cada minuto. */
const TOUCH_INTERVAL_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Acceso restringido: solo los correos de `MCP_BETA_EMAILS` (separados por
 * comas) crean y usan tokens. Sin la variable no puede nadie (fail-closed).
 */
export function isMcpEnabledFor(email: string): boolean {
  const allowed = (process.env.MCP_BETA_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isApiTokenActive(token: ApiToken, now: Date): boolean {
  return token.revokedAt === null && new Date(token.expiresAt).getTime() > now.getTime();
}

export interface CreateApiTokenInput {
  name: string;
  days?: number;
  now?: Date;
}

/** Crea un token para la persona de la sesión. El valor en claro solo existe en este retorno. */
export async function createApiToken(
  store: DataStore,
  session: SessionContext,
  input: CreateApiTokenInput,
): Promise<{ token: string; record: ApiToken }> {
  const now = input.now ?? new Date();
  if (!isMcpEnabledFor(session.email)) throw forbidden('Esta función no está disponible para tu cuenta.');
  const name = input.name.trim();
  if (name.length < MIN_API_TOKEN_NAME) throw invalid('Ponle un nombre al token (mínimo 3 caracteres).');
  if (name.length > MAX_API_TOKEN_NAME) throw invalid(`El nombre admite hasta ${MAX_API_TOKEN_NAME} caracteres.`);

  const days = input.days ?? DEFAULT_API_TOKEN_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > MAX_API_TOKEN_DAYS) {
    throw invalid(`La caducidad debe estar entre 1 y ${MAX_API_TOKEN_DAYS} días.`);
  }

  const existing = await store.listApiTokens(session.userId);
  if (existing.filter((token) => isApiTokenActive(token, now)).length >= MAX_ACTIVE_API_TOKENS) {
    throw invalid(`Ya tienes ${MAX_ACTIVE_API_TOKENS} tokens activos. Revoca alguno antes de crear otro.`);
  }

  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  const record = await store.insertApiToken({
    id: randomUUID(),
    userId: session.userId,
    name,
    tokenHash: hashApiToken(token),
    tokenPrefix: token.slice(0, API_TOKEN_PREFIX.length + 4),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * DAY_MS).toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  });

  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'API_TOKEN_CREATED',
    fieldName: 'api_token',
    newValue: { tokenId: record.id, name: record.name, expiresAt: record.expiresAt },
    at: now,
  });

  return { token, record };
}

/** Cada persona revoca solo sus propios tokens. */
export async function revokeApiToken(
  store: DataStore,
  session: SessionContext,
  input: { tokenId: string; now?: Date },
): Promise<ApiToken> {
  const now = input.now ?? new Date();
  const token = await store.apiTokenById(input.tokenId);
  if (!token) throw notFound('No existe ese token.');
  if (token.userId !== session.userId) throw forbidden('Solo puedes revocar tus propios tokens.');
  if (token.revokedAt) return token;

  const revoked = await store.revokeApiToken(token.id, now.toISOString());
  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'API_TOKEN_REVOKED',
    fieldName: 'api_token',
    oldValue: { tokenId: token.id, name: token.name },
    at: now,
  });
  return revoked;
}

/**
 * Resuelve un token a la sesión de su dueña o dueño, o `null` (fail-closed) si
 * no existe, está revocado o caducado, o la persona ya no tiene acceso activo.
 */
export async function resolveApiToken(
  store: DataStore,
  plaintext: string,
  now: Date = new Date(),
): Promise<SessionContext | null> {
  if (!plaintext.startsWith(API_TOKEN_PREFIX) || plaintext.length > 128) return null;

  const token = await store.apiTokenByHash(hashApiToken(plaintext));
  if (!token || !isApiTokenActive(token, now)) return null;

  const user = await store.userById(token.userId);
  if (!user || !user.isActive || user.isAnonymized || !isMcpEnabledFor(user.email)) return null;

  if (!token.lastUsedAt || now.getTime() - new Date(token.lastUsedAt).getTime() > TOUCH_INTERVAL_MS) {
    await store.touchApiToken(token.id, now.toISOString());
  }

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    departments: user.departments,
    role: user.role,
  };
}
