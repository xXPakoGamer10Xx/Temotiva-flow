'use client';

import { BellOff } from 'lucide-react';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { setOwnNotificationsAction, setTeamNotificationsAction } from '@/server/actions/notifications';
import type { NotificationSettingsView } from '@/server/services/notification-settings';
import { ActionError, useAction } from '@/lib/use-action';
import { Card, SectionLabel } from '@/components/ui/primitives';

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
      />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-fg-muted">{description}</span>
      </span>
    </label>
  );
}

/**
 * Preferencias de notificación. Los responsables eligen si reciben las suyas y
 * si el equipo de su área recibe las del área; el miembro solo ve el aviso.
 */
export function NotificationPreferences({ settings }: { settings: NotificationSettingsView }) {
  const own = useAction(setOwnNotificationsAction, { success: 'Preferencia guardada' });
  const team = useAction(setTeamNotificationsAction, { success: 'Preferencia guardada' });

  if (settings.mutedAreas.length > 0) {
    return (
      <p className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-xs text-fg-muted">
        <BellOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        El responsable de {settings.mutedAreas.map((department) => DEPARTMENT_LABELS[department]).join(', ')} desactivó las
        notificaciones del equipo en esa área. Sus solicitudes las sigue recibiendo el responsable.
      </p>
    );
  }

  if (!settings.canChooseOwn && settings.configurableAreas.length === 0) return null;

  return (
    <section className="space-y-2">
      <SectionLabel>Preferencias</SectionLabel>
      <Card className="space-y-3 p-4">
        {settings.canChooseOwn ? (
          <Toggle
            label="Recibir mis notificaciones"
            description="Las solicitudes de ayuda dirigidas a tus áreas. Si lo apagas, no te llegan ni cuentan en el menú."
            checked={settings.ownEnabled}
            disabled={own.isPending}
            onChange={(enabled) => own.run({ enabled })}
          />
        ) : null}
        {settings.configurableAreas.map((area) => (
          <Toggle
            key={area.department}
            label={`Notificar a todo el equipo de ${area.label}`}
            description={`El equipo de ${area.label} recibe las solicitudes dirigidas a esa área. No afecta a otras áreas.`}
            checked={area.teamEnabled}
            disabled={team.isPending}
            onChange={(enabled) => team.run({ department: area.department, enabled })}
          />
        ))}
        <ActionError message={own.error ?? team.error} />
      </Card>
    </section>
  );
}
