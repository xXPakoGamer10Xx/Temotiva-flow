'use client';

import * as React from 'react';
import { markNotificationsSeenAction } from '@/server/actions/notifications';

/** Al abrir la bandeja, las solicitudes actuales cuentan como vistas. */
export function MarkNotificationsSeen() {
  React.useEffect(() => {
    void markNotificationsSeenAction();
  }, []);
  return null;
}
