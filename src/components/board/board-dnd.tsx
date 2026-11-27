'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { advanceStageAction } from '@/server/actions/initiatives';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { StageNoteDialog } from '@/components/initiative/stage-note-dialog';

/**
 * Arrastrar y soltar en el tablero. Solo es comodidad: mover una tarjeta es lo
 * mismo que pulsar "Avanzar" en la ficha, así que pasa por `advanceStageAction`
 * y el servidor decide (área propietaria, compuerta completa, override).
 *
 * Solo se arrastran tarjetas que la persona puede avanzar, y solo se puede
 * soltar en la fase siguiente de esa tarjeta. Con la compuerta completa, soltar
 * pide antes la nota de avance (spec 005, RF-5); si falta algo, abre la ficha
 * en Compuerta sin llamar al servidor.
 */

interface Dragging {
  cardId: string;
  targetStageId: number;
  gateComplete: boolean;
}

interface DndContextValue {
  dragging: Dragging | null;
  setDragging: (value: Dragging | null) => void;
  drop: (stageId: number, stageName: string) => void;
  pending: boolean;
}

const DndContext = React.createContext<DndContextValue | null>(null);

export function BoardDndProvider({
  basePath,
  query,
  children,
}: {
  basePath: string;
  query?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [dragging, setDragging] = React.useState<Dragging | null>(null);
  const [pending, setPending] = React.useState(false);

  const [noteFor, setNoteFor] = React.useState<{ cardId: string; stageName: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const openGate = React.useCallback(
    (cardId: string): void => {
      const next = new URLSearchParams(query ?? '');
      next.set('iniciativa', cardId);
      next.set('tab', 'gate');
      router.push(`${basePath}?${next.toString()}` as Route, { scroll: false });
    },
    [router, basePath, query],
  );

  const drop = React.useCallback(
    (stageId: number, stageName: string): void => {
      const current = dragging;
      setDragging(null);
      if (!current || current.targetStageId !== stageId || pending) return;
      if (!current.gateComplete) {
        // Compuerta incompleta: nunca un error pasivo, se abre la ficha en Compuerta.
        toast(`${current.cardId} tiene aprobaciones pendientes en la compuerta`, 'info');
        openGate(current.cardId);
        return;
      }
      setError(null);
      setNoteFor({ cardId: current.cardId, stageName });
    },
    [dragging, pending, openGate],
  );

  const advance = React.useCallback(
    (note: string): void => {
      const target = noteFor;
      if (!target) return;
      setPending(true);
      void advanceStageAction({ initiativeId: target.cardId, note })
        .then((result) => {
          if (!result.ok) {
            setError(result.message);
            return;
          }
          setNoteFor(null);
          if (result.data.status === 'ADVANCED') {
            toast(`${target.cardId} avanzó a ${result.data.toStageName ?? 'la siguiente fase'}`);
            router.refresh();
            return;
          }
          toast(`${target.cardId} tiene aprobaciones pendientes en la compuerta`, 'info');
          openGate(target.cardId);
        })
        .catch(() => setError('No se pudo mover la iniciativa. Inténtalo de nuevo.'))
        .finally(() => setPending(false));
    },
    [noteFor, router, openGate],
  );

  const value = React.useMemo(() => ({ dragging, setDragging, drop, pending }), [dragging, drop, pending]);
  return (
    <DndContext.Provider value={value}>
      {children}
      {noteFor ? (
        <StageNoteDialog
          title={`Avanzar ${noteFor.cardId} a ${noteFor.stageName}`}
          description="Cuenta qué se hizo o cerró en la fase. Queda en el historial con tu nombre y la fecha."
          confirmLabel="Avanzar"
          pending={pending}
          error={error}
          onSubmit={advance}
          onClose={() => setNoteFor(null)}
        />
      ) : null}
    </DndContext.Provider>
  );
}

function useDnd(): DndContextValue | null {
  return React.useContext(DndContext);
}

/** Envuelve una tarjeta: arrastrable solo si la persona puede avanzarla. */
export function DraggableCard({
  cardId,
  targetStageId,
  gateComplete,
  children,
}: {
  cardId: string;
  targetStageId: number | null;
  /** Con todas las aprobaciones, soltar pide la nota; si no, abre la compuerta. */
  gateComplete: boolean;
  children: React.ReactNode;
}) {
  const dnd = useDnd();
  if (!dnd || targetStageId === null) return <>{children}</>;

  const isDragged = dnd.dragging?.cardId === cardId;
  return (
    <div
      draggable={!dnd.pending}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', cardId);
        dnd.setDragging({ cardId, targetStageId, gateComplete });
      }}
      onDragEnd={() => dnd.setDragging(null)}
      className={cn('shrink-0 cursor-grab active:cursor-grabbing', isDragged && 'opacity-50')}
    >
      {children}
    </div>
  );
}

/** Cuerpo de la columna: solo acepta la tarjeta cuya siguiente fase es esta. */
export function DropZone({
  stageId,
  stageName,
  className,
  children,
}: {
  stageId: number;
  stageName: string;
  className?: string;
  children: React.ReactNode;
}) {
  const dnd = useDnd();
  const [over, setOver] = React.useState(false);
  const accepts = dnd?.dragging?.targetStageId === stageId;

  return (
    <div
      className={cn(className, accepts && 'rounded-lg outline-2 -outline-offset-2 outline-dashed outline-[var(--accent)]', over && accepts && 'bg-accent/10')}
      aria-label={accepts ? `Soltar aquí para avanzar a ${stageName}` : undefined}
      onDragOver={(event) => {
        if (!accepts) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        if (!accepts) return;
        event.preventDefault();
        dnd?.drop(stageId, stageName);
      }}
    >
      {children}
    </div>
  );
}
