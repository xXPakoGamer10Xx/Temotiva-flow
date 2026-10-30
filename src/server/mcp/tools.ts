import { z } from 'zod';
import type { SessionContext } from '@/domain/types';
import { DEPARTMENT_LABELS, USER_ROLE_LABELS } from '@/domain/labels';
import type { DataStore } from '@/server/repositories/types';
import { MY_WORK_VIEWS, getBoardView, getInitiativeDetail, getMyWork, getNotifications, getRadarRows } from '@/server/services/views';

/**
 * Herramientas del servidor MCP. V1 es solo lectura: reutilizan las mismas
 * vistas que pintan la interfaz, con la sesión de quien posee el token, así que
 * ven exactamente lo que esa persona vería entrando por la web.
 *
 * Quedan fuera a propósito avanzar fase, override, altas y cambios de rol: son
 * las acciones críticas y exigen confirmación humana en la interfaz.
 */

export interface McpTool {
  name: string;
  description: string;
  schema: z.ZodType;
  run(context: { store: DataStore; session: SessionContext; args: never }): Promise<unknown>;
}

function tool<Schema extends z.ZodType>(definition: {
  name: string;
  description: string;
  schema: Schema;
  run(context: { store: DataStore; session: SessionContext; args: z.infer<Schema> }): Promise<unknown>;
}): McpTool {
  return definition as unknown as McpTool;
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
];
