/** Cookie por persona: dos cuentas en el mismo navegador no comparten lo "visto". */
export const notificationsSeenCookie = (userId: string): string => `temo_notif_seen_${userId}`;
