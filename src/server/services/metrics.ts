import type { StopReason } from '@/domain/enums';
import type { ActivityLogEntry, WorkflowStage } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { computeSle } from './sle';

/**
 * Vista 4 — Panel de Dirección (TemoFlow.md §3.4).
 *
 * Métricas puramente sistémicas: miden el proceso, nunca a las personas. No se
 * expone ningún agregado por individuo, por diseño.
 */

const HOUR_MS = 60 * 60 * 1000;

export interface StagePerformance {
  stage: WorkflowStage;
  /** Permanencia neta media histórica en la fase (ms). */
  averageNetMs: number;
  /** Tiempo medio en parada dentro de la fase (ms). */
  averageBlockedMs: number;
  targetMs: number;
  /** Veces que una iniciativa ha salido de esta fase. */
  samples: number;
  /** Cuántas de esas salidas superaron el objetivo. */
  breaches: number;
  /** Iniciativas que están ahora mismo en la fase. */
  currentCount: number;
}

export interface StopCauseSlice {
  reason: StopReason;
  count: number;
  share: number;
  totalMs: number;
}

export interface OverrideStat {
  stageName: string;
  overrides: number;
  transitions: number;
  rate: number;
}

export interface FlowMetrics {
  stages: StagePerformance[];
  stopCauses: StopCauseSlice[];
  overrides: {
    total: number;
    transitions: number;
    rate: number;
    byStage: OverrideStat[];
    recent: { initiativeId: string; authorizedBy: string; reason: string; createdAt: string }[];
  };
  headline: {
    activeInitiatives: number;
    blockedInitiatives: number;
    pendingDependencies: number;
    atRiskOrExceeded: number;
  };
}

function numberField(entry: ActivityLogEntry, field: string): number {
  const value = entry.newValue;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === 'number' ? raw : 0;
}

function stringField(entry: ActivityLogEntry, field: string): string | null {
  const value = entry.newValue;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === 'string' ? raw : null;
}

export async function getFlowMetrics(store: DataStore, options: { now?: Date } = {}): Promise<FlowMetrics> {
  const now = options.now ?? new Date();
  const [stages, initiatives, dependencies, log] = await Promise.all([
    store.listStages(),
    store.listInitiatives({ includeArchived: true }),
    store.listDependencies(),
    store.listActivityLog(),
  ]);

  const transitions = log.filter((entry) => entry.actionType === 'STAGE_TRANSITION');
  const overrides = log.filter((entry) => entry.actionType === 'EXCEPTION_OVERRIDE');
  const blockEvents = log.filter((entry) => entry.actionType === 'BLOCKED_SET');
  const unblockEvents = log.filter((entry) => entry.actionType === 'BLOCKED_CLEARED');

  // --- Gráfico 1: permanencia media por fase frente al SLE ---------------------
  const stagePerformance: StagePerformance[] = stages.map((stage) => {
    const samples = transitions.filter((entry) => entry.fromStageId === stage.id);
    const targetMs = stage.sleHours * HOUR_MS;
    const netTotal = samples.reduce((total, entry) => total + numberField(entry, 'netDurationMs'), 0);
    const blockedTotal = samples.reduce((total, entry) => total + numberField(entry, 'blockedMs'), 0);

    return {
      stage,
      averageNetMs: samples.length ? netTotal / samples.length : 0,
      averageBlockedMs: samples.length ? blockedTotal / samples.length : 0,
      targetMs,
      samples: samples.length,
      breaches: samples.filter((entry) => numberField(entry, 'netDurationMs') > targetMs).length,
      currentCount: initiatives.filter(
        (initiative) => !initiative.isArchived && initiative.currentStageId === stage.id,
      ).length,
    };
  });

  // --- Gráfico 2: distribución de causas de parada ------------------------------
  //
  // Se recorre el historial por iniciativa emparejando apertura con cierre. Si
  // llegaran dos aperturas seguidas sin cierre (datos antiguos, antes de que el
  // estado de parada se recalculara en un solo sitio), la segunda se ignora:
  // contar ambas inflaba el recuento y sumaba intervalos solapados.
  const causeCounts = new Map<StopReason, { count: number; totalMs: number }>();
  const byInitiative = new Map<string, ActivityLogEntry[]>();

  for (const entry of [...blockEvents, ...unblockEvents]) {
    const key = entry.initiativeId ?? '—';
    const list = byInitiative.get(key) ?? [];
    list.push(entry);
    byInitiative.set(key, list);
  }

  for (const entries of byInitiative.values()) {
    let open: { reason: StopReason; startedAt: number } | null = null;

    for (const entry of entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (entry.actionType === 'BLOCKED_SET') {
        if (open) continue; // ya había una parada viva: no es una parada nueva
        const reason = stringField(entry, 'stopReason') as StopReason | null;
        if (!reason) continue;
        open = { reason, startedAt: new Date(entry.createdAt).getTime() };
        continue;
      }

      if (entry.actionType === 'BLOCKED_CLEARED' && open) {
        const current = causeCounts.get(open.reason) ?? { count: 0, totalMs: 0 };
        current.count += 1;
        current.totalMs += Math.max(0, new Date(entry.createdAt).getTime() - open.startedAt);
        causeCounts.set(open.reason, current);
        open = null;
      }
    }

    // Parada todavía abierta: cuenta desde su inicio hasta ahora.
    if (open) {
      const current = causeCounts.get(open.reason) ?? { count: 0, totalMs: 0 };
      current.count += 1;
      current.totalMs += Math.max(0, now.getTime() - open.startedAt);
      causeCounts.set(open.reason, current);
    }
  }

  const totalStops = [...causeCounts.values()].reduce((total, value) => total + value.count, 0);
  const stopCauses: StopCauseSlice[] = [...causeCounts.entries()]
    .map(([reason, value]) => ({
      reason,
      count: value.count,
      totalMs: value.totalMs,
      share: totalStops ? value.count / totalStops : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // --- Gráfico 3: tasa de avances excepcionales ----------------------------------
  const overridesByStage: OverrideStat[] = stages.map((stage) => {
    const stageTransitions = transitions.filter((entry) => entry.fromStageId === stage.id).length;
    const stageOverrides = overrides.filter((entry) => entry.fromStageId === stage.id).length;
    return {
      stageName: stage.name,
      overrides: stageOverrides,
      transitions: stageTransitions,
      rate: stageTransitions ? stageOverrides / stageTransitions : 0,
    };
  });

  const active = initiatives.filter((initiative) => !initiative.isArchived);
  const stagesById = new Map(stages.map((stage) => [stage.id, stage]));

  return {
    stages: stagePerformance,
    stopCauses,
    overrides: {
      total: overrides.length,
      transitions: transitions.length,
      rate: transitions.length ? overrides.length / transitions.length : 0,
      byStage: overridesByStage,
      recent: overrides
        .slice()
        .reverse()
        .slice(0, 5)
        .map((entry) => ({
          initiativeId: entry.initiativeId ?? '—',
          authorizedBy: entry.overrideMetadata?.authorizedBy ?? '—',
          reason: entry.overrideMetadata?.reason ?? '',
          createdAt: entry.createdAt,
        })),
    },
    headline: {
      activeInitiatives: active.length,
      blockedInitiatives: active.filter((initiative) => initiative.isBlocked).length,
      pendingDependencies: dependencies.filter((dependency) => dependency.status === 'PENDING').length,
      atRiskOrExceeded: active.filter((initiative) => {
        const stage = stagesById.get(initiative.currentStageId);
        if (!stage) return false;
        return computeSle(initiative, stage, now).state !== 'ON_TIME';
      }).length,
    },
  };
}
