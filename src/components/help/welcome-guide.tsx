'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { UserRole } from '@/domain/enums';
import { UI_EVENTS, useUiEvent } from '@/components/command/command-bus';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Step {
  title: string;
  body: string;
}

const COMMON_STEPS: Step[] = [
  {
    title: 'Bienvenida a Temotiva Flow',
    body: 'Aquí se ve en qué punto está cada iniciativa, quién la tiene y a quién espera. Cada iniciativa (TEMO-XXX) avanza por 7 fases, de Ideación a Producción, y cada fase tiene un departamento dueño.',
  },
  {
    title: 'El tablero: lo que te toca',
    body: 'Cada tarjeta muestra su prioridad, su reloj SLE y cuántos requisitos de salida lleva cerrados. Filtra por tu departamento para ver solo lo tuyo. Pulsa una tarjeta para abrir su ficha completa.',
  },
  {
    title: 'La compuerta: no se avanza a medias',
    body: 'Para pasar de fase hay que cerrar todos los requisitos de la lista. Si falta alguno, la pantalla te dice cuál y te deja pedírselo al departamento responsable con un clic.',
  },
  {
    title: 'Pedir ayuda sin perder la iniciativa',
    body: 'Con 🆘 pides ayuda a otro departamento. La iniciativa sigue siendo tuya. Si la ayuda es imprescindible para seguir, márcala como «bloqueante»: la iniciativa se para y el reloj SLE se pausa.',
  },
];

const ROLE_STEPS: Record<UserRole, Step | null> = {
  MEMBER: null,
  LEAD: {
    title: 'Como Responsable de área',
    body: 'Tú cambias la prioridad y reasignas la propiedad de las iniciativas de tu área, das de alta a miembros en tus áreas y puedes autorizar un avance excepcional (con motivo, riesgo y firma).',
  },
  EXECUTIVE: {
    title: 'Como Dirección',
    body: 'Tienes el Panel de dirección con la salud del flujo (dónde se atasca, por qué se para, cuánto se fuerza la compuerta) y en Equipo gestionas la lista de acceso y los objetivos de SLE y WIP.',
  },
};

const FINAL_STEP: Step = {
  title: 'Cuando dudes, pregunta a la app',
  body: 'Los iconos ⓘ explican cada concepto al pulsarlos. En Ayuda tienes el glosario completo, y con ⌘K o Ctrl+K abres la paleta para ir a cualquier sitio. Con la tecla ? ves todos los atajos.',
};

const storageKey = (userId: string): string => `tf:onboarding:v1:${userId}`;

const seenListeners = new Set<() => void>();

/** ¿Ya vio la guía? Sin almacenamiento disponible se da por vista para no repetirla en cada visita. */
function readSeen(userId: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId)) !== null;
  } catch {
    return true;
  }
}

function subscribeSeen(listener: () => void): () => void {
  seenListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    seenListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/**
 * Guía de bienvenida: se muestra la primera vez que alguien entra y se puede
 * reabrir desde Ayuda. Solo guarda una preferencia de interfaz en el navegador.
 */
export function WelcomeGuide({ userId, role }: { userId: string; role: UserRole }) {
  const [manualOpen, setManualOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  // En el servidor se asume «vista» para que la guía no parpadee al hidratar.
  const seen = React.useSyncExternalStore(
    subscribeSeen,
    () => readSeen(userId),
    () => true,
  );
  const open = manualOpen || !seen;

  const steps = React.useMemo(() => {
    const roleStep = ROLE_STEPS[role];
    return [...COMMON_STEPS, ...(roleStep ? [roleStep] : []), FINAL_STEP];
  }, [role]);

  useUiEvent(UI_EVENTS.openWelcome, () => {
    setIndex(0);
    setManualOpen(true);
  });

  const close = (): void => {
    setManualOpen(false);
    try {
      localStorage.setItem(storageKey(userId), 'seen');
    } catch {
      // Sin almacenamiento, la guía simplemente puede volver a aparecer.
    }
    for (const listener of seenListeners) listener();
  };

  const step: Step = steps[index] ?? COMMON_STEPS[0]!;
  const isLast = index === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setManualOpen(true) : close())}>
      <DialogContent className="w-[min(30rem,calc(100vw-2rem))]">
        <DialogHeader className="flex items-center gap-3">
          <Image src="/brand/cerebrin-saludando.png" alt="" width={56} height={56} className="size-14 shrink-0 object-contain" />
          <div className="min-w-0">
            <DialogTitle>{step.title}</DialogTitle>
            <DialogDescription>
              Paso {index + 1} de {steps.length}
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm leading-relaxed text-fg-muted">{step.body}</p>
          <div className="mt-4 flex gap-1.5" aria-hidden="true">
            {steps.map((_, dot) => (
              <span key={dot} className={dot === index ? 'h-1.5 w-5 rounded-full bg-accent' : 'h-1.5 w-1.5 rounded-full bg-border-strong'} />
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Saltar
          </Button>
          {index > 0 ? (
            <Button variant="outline" onClick={() => setIndex(index - 1)}>
              Atrás
            </Button>
          ) : null}
          {isLast ? (
            <>
              <Button variant="outline" asChild>
                <Link href="/ayuda" onClick={close}>
                  Ver la ayuda
                </Link>
              </Button>
              <Button onClick={close}>Empezar</Button>
            </>
          ) : (
            <Button onClick={() => setIndex(index + 1)}>Siguiente</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
