import { z } from 'zod';
import { DEPARTMENTS, TASK_STATUSES } from '@/domain/enums';
import type { SessionContext } from '@/domain/types';
import { DEPARTMENT_LABELS, USER_ROLE_LABELS } from '@/domain/labels';
import { MAX_TASK_DESCRIPTION, MAX_TASK_TITLE, MIN_TASK_TITLE } from '@/domain/rules';
import type { DataStore } from '@/server/repositories/types';
import { assignDeptTask, createDeptTask, getTasksView, moveDeptTask, planDeptTask } from '@/server/services/dept-tasks';
import { carryOverSprint, createSprint, getTechSprintView, updateSprint } from '@/server/services/tech-sprint';
import { MY_WORK_VIEWS, getBoardView, getInitiativeDetail, getMyWork, getNotifications, getRadarRows } from '@/server/services/views';

/**
 * Herramientas del servidor MCP. Reutilizan las mismas vistas y servicios que
 * la interfaz, con la sesión de quien posee el token, así que ven y pueden
 * exactamente lo que esa persona vería y podría hacer entrando por la web.
 *
 * Casi todas son de solo lectura. Las que escriben son `crear_tarea`,
 * `asignar_tarea`, `mover_tarea` (tareas de área) y las del sprint de Tech
 * (`crear_sprint`, `editar_sprint`, `planificar_tarea`, `pasar_pendientes`): son de
 * bajo riesgo, reversibles (baja lógica o editables) y pasan por las mismas reglas
 * de rol y área que la web (solo el LEAD del área o Dirección crean, asignan y
 * planifican) y por la caja negra, con el usuario del token como autor.
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

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD.');

/** Hoy en la zona horaria del equipo (AAAA-MM-DD), igual que la página /tech. */
function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
}

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
      'Personas a quienes esta persona puede asignar tareas (con su id), áreas donde puede crear tareas y tareas abiertas (las hechas solo se cuentan). Con muchas tareas, filtra por `area` o `sprintId` (usa "ninguno" para las que no tienen sprint).',
    schema: z.object({
      area: z.enum(DEPARTMENTS).optional().describe('Solo las tareas de esta área'),
      sprintId: z.string().min(1).optional().describe('Id de un sprint (de `sprint_tech`) o "ninguno" para las que no tienen sprint'),
    }),
    run: async ({ store, session, args }) => {
      const view = await getTasksView(store, session);
      view.tasks = view.tasks.filter(
        (task) =>
          (!args.area || task.department === args.area) &&
          (!args.sprintId || (args.sprintId === 'ninguno' ? task.sprintId === null : task.sprintId === args.sprintId)),
      );
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
      estimatedHours: z.number().min(0).max(80).nullish().describe('Horas estimadas, de media en media hora (Tech)'),
      sprintId: z.string().min(1).nullish().describe('Id del sprint (de `sprint_tech`); solo Tech'),
    }),
    run: async ({ store, session, args }) => {
      const task = await createDeptTask(store, session, args);
      return { id: task.id, code: task.code, title: task.title, department: task.department, assigneeId: task.assigneeId };
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

  tool({
    name: 'sprint_tech',
    description:
      'Sprint de Tech (solo Tech y Dirección): sprints, el elegido (o el vigente) con su ritmo, carga por persona en horas frente a capacidad, riesgos y sus tareas con clave TEC-n, horas, fecha y PR. El backlog sin sprint solo se cuenta; para verlo usa `tareas` con sprintId "ninguno".',
    schema: z.object({ sprintId: z.string().min(1).optional().describe('Id del sprint; por defecto, el vigente') }),
    run: async ({ store, session, args }) => {
      const view = await getTechSprintView(store, session, {
        sprintId: args.sprintId ?? null,
        today: todayKey(),
        githubConfigured: Boolean(process.env.GITHUB_WEBHOOK_SECRET?.trim()),
      });
      const { backlog, suggestion, githubConfigured, ...rest } = view;
      void githubConfigured;
      return {
        ...rest,
        siguienteSprintSugerido: suggestion,
        backlogSinSprint: backlog.length,
        tasks: view.tasks.map((task) => ({
          ...task,
          description: task.description.length > 160 ? `${task.description.slice(0, 160)}…` : task.description,
        })),
      };
    },
  }),
  tool({
    name: 'crear_sprint',
    description:
      'Abre un sprint de Tech. Solo el responsable de Tech o Dirección. Fechas AAAA-MM-DD (el cierre, posterior al inicio). Si no das nombre, usa "Sprint N"; si no das horas, las del sprint anterior.',
    writes: true,
    schema: z.object({
      startDate: dateKey,
      endDate: dateKey,
      name: z.string().trim().max(60).optional(),
      goal: z.string().trim().max(300).optional(),
      capacityHours: z.number().min(0).max(120).optional().describe('Horas disponibles por persona'),
    }),
    run: async ({ store, session, args }) => {
      const sprint = await createSprint(store, session, args);
      return { id: sprint.id, name: sprint.name, startDate: sprint.startDate, endDate: sprint.endDate, capacityHours: sprint.capacityHours };
    },
  }),
  tool({
    name: 'editar_sprint',
    description:
      'Cambia nombre, objetivo, fechas u horas por persona de un sprint de Tech. Con shiftDueDates, las tareas abiertas cuya fecha era el cierre anterior siguen al nuevo cierre.',
    writes: true,
    schema: z.object({
      sprintId: z.string().min(1).describe('Id del sprint (de `sprint_tech`)'),
      name: z.string().trim().max(60).optional(),
      goal: z.string().trim().max(300).optional(),
      startDate: dateKey.optional(),
      endDate: dateKey.optional(),
      capacityHours: z.number().min(0).max(120).optional(),
      shiftDueDates: z.boolean().optional(),
    }),
    run: async ({ store, session, args }) => {
      const { sprint, shiftedTasks } = await updateSprint(store, session, args);
      return {
        id: sprint.id,
        name: sprint.name,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        capacityHours: sprint.capacityHours,
        shiftedTasks,
      };
    },
  }),
  tool({
    name: 'planificar_tarea',
    description:
      'Planifica una tarea de Tech: horas estimadas (0 a 80, de media en media hora), fecha límite y sprint. Pasa null para quitar un valor; lo que no envíes no cambia. Solo el responsable del área o Dirección.',
    writes: true,
    schema: z.object({
      taskId: z.string().min(1).describe('Id de la tarea (de `tareas` o `sprint_tech`)'),
      estimatedHours: z.number().min(0).max(80).nullable().optional(),
      dueDate: dateKey.nullable().optional(),
      sprintId: z.string().min(1).nullable().optional().describe('Id del sprint, o null para devolverla al backlog'),
    }),
    run: async ({ store, session, args }) => {
      const task = await planDeptTask(store, session, args);
      return { id: task.id, code: task.code, title: task.title, estimatedHours: task.estimatedHours, dueDate: task.dueDate, sprintId: task.sprintId };
    },
  }),
  tool({
    name: 'pasar_pendientes',
    description:
      'Pasa al sprint destino todo lo que no está hecho del sprint de origen. Las fechas que eran el cierre de origen pasan al cierre del destino.',
    writes: true,
    schema: z.object({
      fromSprintId: z.string().min(1).describe('Sprint de origen'),
      toSprintId: z.string().min(1).describe('Sprint de destino'),
    }),
    run: ({ store, session, args }) => carryOverSprint(store, session, args),
  }),
];
