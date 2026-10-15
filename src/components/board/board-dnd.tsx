'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { advanceStageAction } from '@/server/actions/initiatives';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

/**
 * Arrastrar y soltar en el tablero. Solo es comodidad: mover una tarjeta es lo
 * mismo que pulsar "Avanzar" en la ficha, así que pasa por `advanceStageAction`
 * y el servidor decide (área propietaria, compuerta completa, override).
 *
 * Solo se arrastran tarjetas que la persona puede avanzar, y solo se puede
 * soltar en la fase siguiente de esa tarjeta.
 */

interface Dragging {
  cardId: string;
  targetStageId: number;
}

interface DndContextValue {
  dragging: Dragging | null;
  setDragging: (value: Dragging | null) => void;
  drop: (stageId: number) => void;
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

  const drop = React.useCallback(
    (stageId: number): void => {
      const current = dragging;
      setDragging(null);
      if (!current || current.targetStageId !== stageId || pending) return;

      setPending(true);
      void advanceStageAction({ initiativeId: current.cardId })
        .then((result) => {
          if (!result.ok) {
            toast(result.message, 'danger');
            return;
          }
          if (result.data.status === 'ADVANCED') {
            toast(`${current.cardId} avanzó a ${result.data.toStageName ?? 'la siguiente fase'}`);
            router.refresh();
            return;
          }
          // Compuerta incompleta: nunca un error pasivo, se abre la ficha en Compuerta.
          toast(`${current.cardId} tiene pendientes en la compuerta de salida`, 'info');
          const next = new URLSearchParams(query ?? '');
          next.set('iniciativa', current.cardId);
          next.set('tab', 'gate');
          router.push(`${basePath}?${next.toString()}` as Route, { scroll: false });
        })
        .catch(() => toast('No se pudo mover la iniciativa. Inténtalo de nuevo.', 'danger'))
        .finally(() => setPending(false));
    },
    [dragging, pending, router, basePath, query],
  );

  const value = React.useMemo(() => ({ dragging, setDragging, drop, pending }), [dragging, drop, pending]);
  return <DndContext.Provider value={value}>{children}</DndContext.Provider>;
}

function useDnd(): DndContextValue | null {
  return React.useContext(DndContext);
}

/** Envuelve una tarjeta: arrastrable solo si la persona puede avanzarla. */
export function DraggableCard({
  cardId,
  targetStageId,
  children,
}: {
  cardId: string;
  targetStageId: number | null;
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
        dnd.setDragging({ cardId, targetStageId });
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
        dnd?.drop(stageId);
      }}
    >
      {children}
    </div>
  );
}
