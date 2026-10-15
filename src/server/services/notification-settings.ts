import { DEPARTMENTS } from '@/domain/enums';
import type { Department } from '@/domain/enums';
import type { SessionContext } from '@/domain/types';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { assertPermission, canChooseOwnNotifications, canConfigureAreaNotifications } from './rbac';

/**
 * Preferencias de notificación (por defecto todo activado):
 *  - cada responsable decide si recibe las suyas;
 *  - cada responsable decide si el resto del equipo de **su** área recibe las de esa área.
 * Dirección puede configurar cualquier área.
 */

export async function setOwnNotifications(
  store: DataStore,
  session: SessionContext,
  input: { enabled: boolean; now?: Date },
): Promise<void> {
  assertPermission(
    canChooseOwnNotifications(session),
    'Solo los responsables de área y Dirección eligen si reciben notificaciones; tu responsable decide las del equipo.',
  );
  const previous = (await store.notificationPrefByUser(session.userId))?.enabled ?? true;
  if (previous === input.enabled) return;

  await store.setNotificationPref({ userId: session.userId, enabled: input.enabled });
  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'NOTIFICATION_SETTINGS_CHANGED',
    fieldName: 'notification_prefs',
    oldValue: { enabled: previous },
    newValue: { enabled: input.enabled },
    at: input.now,
  });
}

export async function setTeamNotifications(
  store: DataStore,
  session: SessionContext,
  input: { department: Department; enabled: boolean; now?: Date },
): Promise<void> {
  assertPermission(
    canConfigureAreaNotifications(session, input.department),
    `Solo el responsable de ${DEPARTMENT_LABELS[input.department]} o Dirección pueden cambiar las notificaciones de su equipo.`,
  );
  const now = input.now ?? new Date();
  const settings = await store.listDepartmentNotificationSettings();
  const previous = settings.find((setting) => setting.department === input.department)?.teamEnabled ?? true;
  if (previous === input.enabled) return;

  await store.setDepartmentNotificationSetting({
    department: input.department,
    teamEnabled: input.enabled,
    updatedBy: session.userId,
    updatedAt: now.toISOString(),
  });
  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'NOTIFICATION_SETTINGS_CHANGED',
    fieldName: 'department_notification_settings',
    oldValue: { department: input.department, teamEnabled: previous },
    newValue: { department: input.department, teamEnabled: input.enabled },
    at: now,
  });
}

export interface NotificationSettingsView {
  /** Solo responsables y Dirección eligen la propia; el equipo la sigue del área. */
  canChooseOwn: boolean;
  ownEnabled: boolean;
  /** Áreas cuyo equipo puede configurar esta persona (las suyas; todas para Dirección). */
  configurableAreas: { department: Department; label: string; teamEnabled: boolean }[];
  /** Para un miembro: las áreas suyas cuyo responsable apagó las notificaciones del equipo. */
  mutedAreas: Department[];
}

export async function getNotificationSettingsView(
  store: DataStore,
  session: SessionContext,
): Promise<NotificationSettingsView> {
  const [ownPref, settings] = await Promise.all([
    store.notificationPrefByUser(session.userId),
    store.listDepartmentNotificationSettings(),
  ]);
  const teamEnabled = (department: Department): boolean =>
    settings.find((setting) => setting.department === department)?.teamEnabled ?? true;

  const candidates = session.role === 'EXECUTIVE' ? [...DEPARTMENTS] : session.departments;
  return {
    canChooseOwn: canChooseOwnNotifications(session),
    ownEnabled: ownPref?.enabled ?? true,
    configurableAreas: candidates
      .filter((department) => canConfigureAreaNotifications(session, department))
      .map((department) => ({
        department,
        label: DEPARTMENT_LABELS[department],
        teamEnabled: teamEnabled(department),
      })),
    mutedAreas: session.role === 'MEMBER' ? session.departments.filter((department) => !teamEnabled(department)) : [],
  };
}
