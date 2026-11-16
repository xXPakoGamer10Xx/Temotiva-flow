/**
 * Confirmación de lectura de las tareas de área (spec 003).
 *
 * Espejo de la tabla `dept_task_reads` (`db/11-dept-task-reads.sql`): un ciclo
 * por cada vez que una tarea pasa a manos de una persona. Los ciclos no se
 * borran; solo se cierran.
 */

export const TASK_READ_SOURCES = ['MANUAL', 'AUTO'] as const;
/** `MANUAL`: marcó la casilla. `AUTO`: sacó la tarea de «Por hacer» sin marcarla. */
export type TaskReadSource = (typeof TASK_READ_SOURCES)[number];

export interface DeptTaskReadCycle {
  id: string;
  taskId: string;
  assigneeId: string;
  /** `null` solo en tareas asignadas antes de esta versión (RF-09). */
  assignedAt: string | null;
  readAt: string | null;
  readSource: TaskReadSource | null;
  resolvedAt: string | null;
  /** `null` = ciclo abierto. Como mucho uno por tarea. */
  closedAt: string | null;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MIN = 60;
const DAY_MIN = 24 * HOUR_MIN;

/** Duración en español, sin segundos (RF-13): «< 1 min», «12 min», «3 h 20 min», «2 d 4 h». */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE_MS);
  if (minutes < 1) return '< 1 min';
  if (minutes < HOUR_MIN) return `${minutes} min`;
  if (minutes < DAY_MIN) {
    const hours = Math.floor(minutes / HOUR_MIN);
    const rest = minutes % HOUR_MIN;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }
  const days = Math.floor(minutes / DAY_MIN);
  const hours = Math.floor((minutes % DAY_MIN) / HOUR_MIN);
  return hours === 0 ? `${days} d` : `${days} d ${hours} h`;
}

/** Milisegundos entre dos instantes ISO, o `null` si falta alguno. */
export function elapsedBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  return new Date(to).getTime() - new Date(from).getTime();
}
