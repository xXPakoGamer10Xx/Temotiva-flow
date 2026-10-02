import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { GLOSSARY, GLOSSARY_KEYS, ROLE_GUIDE, STAGE_GUIDE } from '@/domain/glossary';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { USER_ROLES } from '@/domain/enums';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Kbd, SectionLabel } from '@/components/ui/primitives';
import { SHORTCUTS } from '@/components/command/shortcuts';
import { ReplayGuideButton } from '@/components/help/replay-guide-button';
import { formatDuration } from '@/server/services/sle';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ayuda' };

const RECIPES: { title: string; steps: string[] }[] = [
  {
    title: 'Avanzar una iniciativa de fase',
    steps: [
      'Abre su ficha y entra en la pestaña «Compuerta».',
      'Marca los requisitos que son de tu departamento. Los de otros departamentos los marcan ellos.',
      'Cuando la lista está al 100 %, pulsa «Avanzar fase». La propiedad pasa sola al departamento de la nueva fase.',
      'Si falta algo, la pantalla te lo dice y te deja pedírselo al departamento responsable con un clic.',
    ],
  },
  {
    title: 'Pedir ayuda a otro departamento',
    steps: [
      'En la ficha, pestaña «Dependencias 🆘», pulsa «Solicitar ayuda».',
      'Elige el departamento y el tipo de necesidad (información, validación, decisión o recursos) y descríbela.',
      'Márcala «bloqueante» solo si no puedes seguir sin ella: pausará el reloj SLE.',
      'El otro departamento la ve en Notificaciones y la resuelve o la rechaza con una nota.',
    ],
  },
  {
    title: 'Declarar una parada',
    steps: [
      'En la cabecera de la ficha, pulsa «Declarar parada».',
      'Elige la causa y explica qué impide continuar.',
      'Mientras dure, el reloj SLE queda en pausa. Cuando se resuelva, levántala desde el mismo sitio.',
    ],
  },
];

/** Página de ayuda: cómo se trabaja, qué significa cada término y qué puede hacer cada rol. */
export default async function HelpPage() {
  const session = await requireSession();
  const stages = (await getDataStore().listStages()).filter((stage) => stage.isActive);

  return (
    <AppShell session={session}>
      <PageHeader
        title="Ayuda"
        description="Cómo funciona Temotiva Flow, qué significa cada término y qué puedes hacer según tu rol."
        actions={<ReplayGuideButton />}
      />

      <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-8 pb-10">
          <section className="space-y-3" aria-labelledby="fases">
            <SectionLabel id="fases">Las 7 fases</SectionLabel>
            <p className="text-sm text-fg-muted">
              Toda iniciativa recorre las mismas fases, en orden y sin saltos. Cada una tiene un departamento
              propietario, un objetivo de permanencia (SLE) y una compuerta de salida.
            </p>
            <ol className="grid gap-2 sm:grid-cols-2">
              {stages.map((stage, position) => (
                <li key={stage.id} className="flex gap-3 rounded-lg border border-border bg-surface p-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-medium tabular-nums text-fg-muted">
                    {position + 1}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">{stage.name}</p>
                    <p className="text-xs leading-relaxed text-fg-muted">{STAGE_GUIDE[stage.key]}</p>
                    <p className="text-xs text-fg-subtle">
                      {DEPARTMENT_LABELS[stage.defaultOwnerDepartment]} · SLE {formatDuration(stage.sleHours * 3600000)} ·
                      cupo {stage.wipLimit}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-3" aria-labelledby="como">
            <SectionLabel id="como">Cómo se hace</SectionLabel>
            <div className="grid gap-3">
              {RECIPES.map((recipe) => (
                <Card key={recipe.title}>
                  <CardHeader>
                    <CardTitle>{recipe.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-muted marker:text-fg-subtle">
                      {recipe.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="glosario">
            <SectionLabel id="glosario">Glosario</SectionLabel>
            <dl className="space-y-3">
              {GLOSSARY_KEYS.map((key) => (
                <div key={key} id={key} className="scroll-mt-20 rounded-lg border border-border bg-surface p-4">
                  <dt className="text-sm font-medium">{GLOSSARY[key].title}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-fg-muted">{GLOSSARY[key].long}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="space-y-3" aria-labelledby="roles">
            <SectionLabel id="roles">Roles</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-3">
              {USER_ROLES.map((role) => (
                <Card key={role} className={role === session.role ? 'ring-2 ring-accent' : undefined}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {ROLE_GUIDE[role].title}
                      {role === session.role ? <Badge tone="accent">Tú</Badge> : null}
                    </CardTitle>
                    <CardDescription>Qué puede hacer</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-fg-muted">
                      {ROLE_GUIDE[role].can.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="atajos">
            <SectionLabel id="atajos">Atajos de teclado</SectionLabel>
            <div className="divide-y divide-border rounded-lg border border-border bg-surface">
              {SHORTCUTS.map((shortcut) => (
                <div key={shortcut.label} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                  <span className="text-fg-muted">{shortcut.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {shortcut.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
