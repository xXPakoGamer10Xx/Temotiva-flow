/**
 * Arranque del servidor (Next 16 llama a `register` una vez por instancia).
 *
 * Engancha las notificaciones push a la caja negra (spec 002 §9). Solo en
 * runtime Node: `web-push` y el store usan APIs de Node. Sin claves VAPID no
 * se registra nada y la app funciona igual que sin push.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { registerPushListener } = await import('./server/push/register-listener');
  registerPushListener();
}
