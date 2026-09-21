import type { Initiative, WorkflowStage } from '@/domain/types';

/**
 * SLE neto (DESIGN.md §7.5, decisión D4): el reloj de permanencia en fase se
 * pausa mientras la iniciativa está en parada. El tiempo bloqueado no cuenta
 * contra el objetivo, pero se conserva para las métricas de dirección.
 */

export type SleState = 'ON_TIME' | 'AT_RISK' | 'EXCEEDED';

import { AT_RISK_RATIO } from '@/domain/rules';

const HOUR_MS = 60 * 60 * 1000;

export interface SleReading {
  /** Tiempo neto consumido en la fase actual, en ms (sin el tiempo en parada). */
  netMs: number;
  /** Tiempo bruto desde la entrada en fase, en ms. */
  elapsedMs: number;
  /** Tiempo acumulado en parada durante la fase actual, en ms. */
  blockedMs: number;
  /** Objetivo de la fase, en ms. */
  targetMs: number;
  /** Fracción consumida (1 = objetivo justo alcanzado). */
  ratio: number;
  /** Exceso sobre el objetivo, en ms (0 si aún está en tiempo). */
  overdueMs: number;
  state: SleState;
}

/** Tiempo total en parada dentro de la fase actual, incluida la parada vigente. */
export function blockedMsInCurrentStage(initiative: Initiative, now: Date): number {
  const consolidated = initiative.blockedMsInStage;
  if (!initiative.isBlocked || !initiative.blockedSince) return consolidated;
  const openBlock = now.getTime() - new Date(initiative.blockedSince).getTime();
  return consolidated + Math.max(0, openBlock);
}

export function computeSle(initiative: Initiative, stage: WorkflowStage, now: Date = new Date()): SleReading {
  const elapsedMs = Math.max(0, now.getTime() - new Date(initiative.stageEnteredAt).getTime());
  const blockedMs = Math.min(elapsedMs, blockedMsInCurrentStage(initiative, now));
  const netMs = Math.max(0, elapsedMs - blockedMs);
  const targetMs = stage.sleHours * HOUR_MS;
  const ratio = targetMs > 0 ? netMs / targetMs : 0;

  return {
    netMs,
    elapsedMs,
    blockedMs,
    targetMs,
    ratio,
    overdueMs: Math.max(0, netMs - targetMs),
    state: ratio > 1 ? 'EXCEEDED' : ratio >= AT_RISK_RATIO ? 'AT_RISK' : 'ON_TIME',
  };
}

/** "12 h", "3 d 4 h" — formato sobrio, sin decimales de más. */
export function formatDuration(ms: number): string {
  const totalHours = Math.floor(ms / HOUR_MS);
  if (totalHours < 1) {
    const minutes = Math.max(0, Math.floor(ms / 60000));
    return `${minutes} min`;
  }
  if (totalHours < 48) return `${totalHours} h`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours === 0 ? `${days} d` : `${days} d ${hours} h`;
}

/** Etiqueta del reloj de la tarjeta: "En tiempo (12 h / 48 h)". */
export function sleLabel(reading: SleReading): string {
  const target = formatDuration(reading.targetMs);
  const net = formatDuration(reading.netMs);
  if (reading.state === 'EXCEEDED') return `Objetivo excedido (+${formatDuration(reading.overdueMs)})`;
  if (reading.state === 'AT_RISK') return `Riesgo (${net} / ${target})`;
  return `En tiempo (${net} / ${target})`;
}
