import { z } from 'zod';
import { DEPARTMENTS, TASK_STATUSES } from '@/domain/enums';
import type { SessionContext } from '@/domain/types';
import { DEPARTMENT_LABELS, USER_ROLE_LABELS } from '@/domain/labels';
import { MAX_TASK_DESCRIPTION, MAX_TASK_TITLE, MIN_TASK_TITLE } from '@/domain/rules';
import type { DataStore } from '@/server/repositories/types';
import { assignDeptTask, createDeptTask, getTasksView, moveDeptTask } from '@/server/services/dept-tasks';
import { MY_WORK_VIEWS, getBoardView, getInitiativeDetail, getMyWork, getNotifications, getRadarRows } from '@/server/services/views';

/**
 * Herramientas del servidor MCP. Reutilizan las mismas vistas y servicios que
 * la interfaz, con la sesión de quien posee el token, así que ven y pueden
 * exactamente lo que esa persona vería y podría hacer entrando por la web.
 *
 * Casi todas son de solo lectura. Las únicas que escriben son `crear_tarea`,
 * `asignar_tarea` y `mover_tarea` (tareas de área): son de bajo riesgo, reversibles (baja
 * lógica) y pasan por las mismas reglas de rol y área que la web (solo el LEAD
 * del área o Dirección crean y asignan) y por la caja negra, con el usuario del
 * token como autor.
 *
 * Quedan fuera a propósito avanzar fase, override, altas y cambios de rol: son
 * las acciones críticas y exigen confirmación humana en la interfaz. Retirar
 * tareas tampoco se expone.
 */

export interface McpTool {
  name: string;
  description: string;
  schema: z.ZodType;
  /** `true` si la herramienta modifica datos. Por defecto, solo lectura. */
  writes: boolean;
  run(context: { store: DataStore; session: SessionContext; args: never }): Promise<unknown>;
}

function tool<Schema extends z.ZodType>(definition: {
  name: string;
  description: string;
  schema: Schema;
  writes?: boolean;
  run(context: { store: DataStore; session: SessionContext; args: z.infer<Schema> }): Promise<unknown>;
}): McpTool {
  return { writes: false, ...definition } as unknown as McpTool;
}

const noArgs = z.object({});

export const MCP_TOOLS: McpTool[] = [
  tool({
    name: 'quien_soy',
    description: 'Devuelve el nombre, rol y áreas de la persona con la que actúa esta conexión.',
    schema: noArgs,
    run: async ({ session }) => ({
      nombre: session.name,
      rol: USER_ROLE_LABELS[session.role],
      areas: session.departments.map((department) => DEPARTMENT_LABELS[department]),
    }),
  }),
  tool({
    name: 'mi_trabajo',
    description:
      'Lo que le toca a esta persona: iniciativas que esperan algo de su área, las suyas, las paradas y las sin asignar en su área.',
    schema: noArgs,
    run: ({ store, session }) => getMyWork(store, session),
  }),
  tool({
    name: 'tablero',
    description:
      'Tablero de flujo: una columna por fase con WIP, SLE y las tarjetas de iniciativa. Opcionalmente filtra por lo que le toca a esta persona.',
    schema: z.object({ vista: z.enum(MY_WORK_VIEWS).optional().describe('mias, esperando o bloqueadas') }),
    run: ({ store, session, args }) => getBoardView(store, { session, filter: args.vista ? { view: args.vista } : {} }),
  }),
  tool({
    name: 'radar_de_esperas',
    description: 'Radar de esperas: qué está esperando cada iniciativa hoy y cuánto lleva.',
    schema: noArgs,
    run: ({ store }) => getRadarRows(store),
  }),
  tool({
    name: 'ver_iniciativa',
    description: 'Ficha completa de una iniciativa: compuerta, dependencias, ruta de fases y trazabilidad.',
    schema: z.object({ id: z.string().regex(/^TEMO-\d+$/, 'Usa el formato TEMO-123.').describe('Identificador, p. ej. TEMO-102') }),
    run: ({ store, args }) => getInitiativeDetail(store, args.id),
  }),
  tool({
    name: 'notificaciones',
    description: 'Solicitudes de ayuda pendientes dirigidas al área de esta persona y las que ella envió.',
    schema: noArgs,
    run: ({ store, session }) => getNotifications(store, session),
  }),
  tool({
    name: 'tareas',
    description:
      'Personas a quienes esta persona puede asignar tareas (con su id), áreas donde puede crear tareas y tareas abiertas (las hechas solo se cuentan).',
    schema: noArgs,
    run: async ({ store, session }) => {
      const view = await getTasksView(store, session);
      // Con muchas tareas la respuesta se corta en el límite del servidor y se
      // perdía justo la lista de personas: va primero, y las hechas se resumen.
      const open = view.tasks
        .filter((task) => task.status !== 'DONE')
        .map((task) => ({
          ...task,
          description: task.description.length > 160 ? `${task.description.slice(0, 160)}…` : task.description,
        }));
      return {
        people: view.people,
        manageableDepartments: view.manageableDepartments,
        doneCount: view.tasks.length - open.length,
        tasks: open,
        initiatives: view.initiatives,
      };
    },
  }),
  tool({
    name: 'crear_tarea',
    description:
      'Crea una tarea de área en "Por hacer". Solo el responsable del área o Dirección pueden crearla. Para asignarla a alguien usa el id que devuelve `tareas`.',
    writes: true,
    schema: z.object({
      title: z.string().trim().min(MIN_TASK_TITLE, 'Ponle un título a la tarea.').max(MAX_TASK_TITLE),
      description: z.string().trim().max(MAX_TASK_DESCRIPTION).optional(),
      department: z.enum(DEPARTMENTS).optional().describe('Área de la tarea; por defecto, la primera de esta persona'),
      assigneeId: z.string().min(1).nullish().describe('Id de la persona (de `tareas`); debe ser del área'),
      initiativeId: z.string().regex(/^TEMO-\d+$/, 'Usa el formato TEMO-123.').nullish(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD.').nullish(),
    }),
    run: async ({ store, session, args }) => {
      const task = await createDeptTask(store, session, args);
      return { id: task.id, title: task.title, department: task.department, assigneeId: task.assigneeId };
    },
  }),
  tool({
    name: 'asignar_tarea',
    description:
      'Asigna una tarea de área a una persona del área (o la desasigna con null). El responsable del área asigna a cualquiera; un miembro solo puede tomar una tarea libre.',
    writes: true,
    schema: z.object({
      taskId: z.string().min(1).describe('Id de la tarea (de `tareas`)'),
      assigneeId: z.string().min(1).nullable().describe('Id de la persona, o null para desasignar'),
    }),
    run: async ({ store, session, args }) => {
      const task = await assignDeptTask(store, session, args);
      return { id: task.id, title: task.title, assigneeId: task.assigneeId };
    },
  }),
  tool({
    name: 'mover_tarea',
    description:
      'Mueve una tarea de área entre columnas: TODO (por hacer), DOING (haciendo), REVIEW (en revisión) o DONE (hecha). Solo el equipo del área puede moverla.',
    writes: true,
    schema: z.object({
      taskId: z.string().min(1).describe('Id de la tarea (de `tareas`)'),
      status: z.enum(TASK_STATUSES).describe('TODO, DOING, REVIEW o DONE'),
    }),
    run: async ({ store, session, args }) => {
      const task = await moveDeptTask(store, session, args);
      return { id: task.id, title: task.title, status: task.status };
    },
  }),
];
