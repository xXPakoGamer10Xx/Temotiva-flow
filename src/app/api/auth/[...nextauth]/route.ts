import { handlers } from '@/lib/auth';

/**
 * Rutas de Auth.js. `force-dynamic` es obligatorio: sin el, el Data Cache de
 * Next puede servir la respuesta de sesion de otra persona (DESIGN.md 4).
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const { GET, POST } = handlers;
