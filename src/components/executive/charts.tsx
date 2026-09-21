import type { FlowMetrics } from '@/server/services/metrics';
import { STOP_REASON_LABELS } from '@/domain/labels';
import { formatDuration } from '@/server/services/sle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives';
import { formatPercent } from '@/lib/utils';
import { cn } from '@/lib/utils';

/**
 * Panel de Dirección (TemoFlow.md §3.4). Métricas del proceso, nunca de las
 * personas: ningún gráfico agrega por individuo.
 *
 * Los tres gráficos son tablas reales con una barra dibujada en una celda, así
 * que el dato es legible con lector de pantalla y sin color. El color solo
 * marca estado (dentro de objetivo / excedido), nunca identidad.
 */

function BarCell({
  ratio,
  tone = 'primary',
  markerRatio,
}: {
  ratio: number;
  tone?: 'primary' | 'danger' | 'info';
  markerRatio?: number;
}) {
  // Un valor cero no dibuja barra: un resto de color ahí se lee como "algo hay".
  const width = ratio <= 0 ? 0 : Math.max(2, Math.min(100, ratio * 100));
  const toneClass = { primary: 'bg-primary', danger: 'bg-danger', info: 'bg-info' }[tone];

  return (
    <div className="relative h-4 w-full min-w-28 rounded-sm bg-muted" aria-hidden="true">
      <div className={cn('h-full rounded-sm', toneClass)} style={{ width: `${width}%` }} />
      {markerRatio !== undefined ? (
        <span
          className="absolute top-[-3px] h-[22px] w-0.5 rounded-full bg-foreground/55"
          style={{ left: `calc(${Math.min(100, markerRatio * 100)}% - 1px)` }}
          title="Objetivo de SLE"
        />
      ) : null}
    </div>
  );
}

/** Gráfico 1 — Permanencia media real por fase frente a su objetivo. */
export function StageTimeChart({ stages }: { stages: FlowMetrics['stages'] }) {
  const scale = Math.max(
    1,
    ...stages.map((stage) => Math.max(stage.averageNetMs, stage.targetMs)),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tiempo medio por fase frente al SLE</CardTitle>
        <CardDescription>
          Permanencia neta media histórica (sin contar el tiempo en parada). La marca vertical es el objetivo de la
          fase: donde la barra la supera, hay cuello de botella estructural.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-xs">
          <caption className="sr-only">Tiempo medio neto por fase frente al objetivo de SLE</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Fase</th>
              <th scope="col">Permanencia media</th>
              <th scope="col">Objetivo</th>
              <th scope="col">Salidas medidas</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => {
              const exceeded = stage.averageNetMs > stage.targetMs;
              return (
                <tr key={stage.stage.id} className="align-middle">
                  <th scope="row" className="w-32 py-1.5 pr-3 text-left font-medium">
                    {stage.stage.name}
                  </th>
                  <td className="py-1.5">
                    <BarCell
                      ratio={stage.averageNetMs / scale}
                      tone={exceeded ? 'danger' : 'primary'}
                      markerRatio={stage.targetMs / scale}
                    />
                  </td>
                  <td className="w-28 py-1.5 pl-3 text-right tabular-nums">
                    <span className={cn('font-medium', exceeded ? 'text-danger' : 'text-foreground')}>
                      {stage.samples ? formatDuration(stage.averageNetMs) : '—'}
                    </span>
                    <span className="text-muted-foreground"> / {formatDuration(stage.targetMs)}</span>
                  </td>
                  <td className="w-24 py-1.5 pl-3 text-right text-[11px] text-muted-foreground">
                    {stage.samples} salida{stage.samples === 1 ? '' : 's'}
                    {stage.breaches > 0 ? ` · ${stage.breaches} fuera` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** Gráfico 2 — Distribución de causas de parada. */
export function StopCausesChart({ causes }: { causes: FlowMetrics['stopCauses'] }) {
  const max = Math.max(1, ...causes.map((cause) => cause.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Causas de parada</CardTitle>
        <CardDescription>
          Por qué se detiene el trabajo, contando todas las paradas registradas y el tiempo acumulado de cada causa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {causes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hay paradas registradas todavía.</p>
        ) : (
          <table className="w-full text-xs">
            <caption className="sr-only">Distribución de causas de parada</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Causa</th>
                <th scope="col">Proporción</th>
                <th scope="col">Tiempo acumulado</th>
              </tr>
            </thead>
            <tbody>
              {causes.map((cause) => (
                <tr key={cause.reason}>
                  <th scope="row" className="w-44 py-1.5 pr-3 text-left font-medium">
                    {STOP_REASON_LABELS[cause.reason]}
                  </th>
                  <td className="py-1.5">
                    <BarCell ratio={cause.count / max} tone="info" />
                  </td>
                  <td className="w-16 py-1.5 pl-3 text-right font-medium tabular-nums">
                    {formatPercent(cause.share)}
                  </td>
                  <td className="w-28 py-1.5 pl-3 text-right text-[11px] text-muted-foreground">
                    {formatDuration(cause.totalMs)} parada
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

/** Gráfico 3 — Tasa de avances excepcionales. */
export function OverrideChart({ overrides }: { overrides: FlowMetrics['overrides'] }) {
  const highPressure = overrides.rate > 0.15;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avances excepcionales</CardTitle>
        <CardDescription>
          Si la excepción deja de ser excepción, la compuerta está mal dimensionada: es síntoma de burocracia
          desajustada, no de mala praxis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3">
          <span className={cn('text-3xl font-semibold tabular-nums', highPressure ? 'text-danger' : 'text-foreground')}>
            {formatPercent(overrides.rate, 1)}
          </span>
          <span className="pb-1 text-xs text-muted-foreground">
            {overrides.total} de {overrides.transitions} transiciones de fase
          </span>
        </div>

        <table className="w-full text-xs">
          <caption className="sr-only">Avances excepcionales por fase de salida</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Fase</th>
              <th scope="col">Excepciones sobre transiciones</th>
            </tr>
          </thead>
          <tbody>
            {overrides.byStage
              .filter((stage) => stage.transitions > 0)
              .map((stage) => (
                <tr key={stage.stageName}>
                  <th scope="row" className="w-32 py-1 pr-3 text-left font-medium">
                    {stage.stageName}
                  </th>
                  <td className="py-1">
                    <BarCell ratio={stage.rate} tone={stage.overrides > 0 ? 'danger' : 'primary'} />
                  </td>
                  <td className="w-24 py-1 pl-3 text-right tabular-nums text-muted-foreground">
                    {stage.overrides}/{stage.transitions}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {overrides.recent.length > 0 ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Últimas excepciones firmadas
            </p>
            <ul className="space-y-1.5">
              {overrides.recent.map((override) => (
                <li key={`${override.initiativeId}-${override.createdAt}`} className="text-[11px]">
                  <span className="font-mono font-semibold">{override.initiativeId}</span> ·{' '}
                  <span className="text-muted-foreground">{override.authorizedBy}</span>
                  <span className="block text-muted-foreground">{override.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Cifras de cabecera del panel. */
export function HeadlineTiles({ headline }: { headline: FlowMetrics['headline'] }) {
  const tiles = [
    { label: 'Iniciativas activas', value: headline.activeInitiatives, tone: 'text-foreground' },
    { label: 'En parada', value: headline.blockedInitiatives, tone: 'text-danger' },
    { label: 'Solicitudes pendientes', value: headline.pendingDependencies, tone: 'text-info' },
    { label: 'En riesgo o fuera de SLE', value: headline.atRiskOrExceeded, tone: 'text-warning' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label} className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{tile.label}</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tile.tone)}>{tile.value}</p>
        </Card>
      ))}
    </div>
  );
}
