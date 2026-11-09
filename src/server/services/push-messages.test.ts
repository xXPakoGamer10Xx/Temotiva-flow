import { describe, expect, it } from 'vitest';
import { PUSH_EVENT_KINDS, type PushEventKind, type PushMessage } from '@/domain/push';
import { buildPushMessage, type PushMessageContext } from './push-messages';

/** Plantillas de los avisos push (spec 002, T-04). Contenido mínimo: §10, CA-07. */

const TASK_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const DEPENDENCY_ID = '55555555-5555-4555-8555-555555555555';

/** Un contexto válido por cada tipo de aviso. */
const CONTEXTS: { [K in PushEventKind]: PushMessageContext[K] } = {
  TASK_ASSIGNED: { taskId: TASK_ID, department: 'PRODUCT', initiativeId: 'TEMO-012' },
  INITIATIVE_ASSIGNED: { initiativeId: 'TEMO-012' },
  DEPENDENCY_INCOMING: { dependencyId: DEPENDENCY_ID, initiativeId: 'TEMO-012', fromDepartment: 'PRODUCT', toDepartment: 'LEGAL' },
  REQUEST_INCOMING: { requestId: REQUEST_ID, fromDepartment: 'PRODUCT', toDepartment: 'LEGAL' },
  DEPENDENCY_RESOLVED: { dependencyId: DEPENDENCY_ID, initiativeId: 'TEMO-012', byDepartment: 'LEGAL' },
  REQUEST_RESOLVED: { requestId: REQUEST_ID, byDepartment: 'LEGAL' },
  ENTERED_BOARD: { initiativeId: 'TEMO-012', stageKey: 'DEV', department: 'TECH' },
  INITIATIVE_CREATED: { initiativeId: 'TEMO-031', department: 'PRODUCT' },
  OVERRIDE: { initiativeId: 'TEMO-012', department: 'TECH' },
  BLOCKED: { initiativeId: 'TEMO-012', department: 'TECH' },
  SLE_AT_RISK: { initiativeId: 'TEMO-012', stageKey: 'DEV', percent: 75 },
};

function build<K extends PushEventKind>(kind: K): PushMessage {
  return buildPushMessage(kind, CONTEXTS[kind]);
}

describe('plantillas de avisos push', () => {
  it('hay plantilla para cada tipo de aviso E1–E11', () => {
    for (const kind of PUSH_EVENT_KINDS) {
      const message = build(kind);
      expect(message.kind).toBe(kind);
      expect(message.title.length).toBeGreaterThan(0);
      expect(message.body.length).toBeGreaterThan(0);
    }
  });

  it('textos en español según el catálogo de la spec §6', () => {
    expect(build('TASK_ASSIGNED')).toMatchObject({ title: 'Tienes una tarea nueva', body: 'Producto · TEMO-012' });
    expect(build('INITIATIVE_ASSIGNED')).toMatchObject({ title: 'Te han asignado TEMO-012' });
    expect(build('DEPENDENCY_INCOMING')).toMatchObject({ title: '🆘 Petición de Producto · TEMO-012', body: 'Para Legal / DPO' });
    expect(build('REQUEST_INCOMING')).toMatchObject({ title: '🆘 Nueva petición de Producto', body: 'Para Legal / DPO' });
    expect(build('DEPENDENCY_RESOLVED')).toMatchObject({ title: '✅ Legal / DPO resolvió tu petición · TEMO-012' });
    expect(build('REQUEST_RESOLVED')).toMatchObject({ title: '✅ Legal / DPO resolvió tu petición' });
    expect(build('ENTERED_BOARD')).toMatchObject({ title: 'TEMO-012 entra en tu tablero', body: 'Desarrollo · Tech' });
    expect(build('INITIATIVE_CREATED')).toMatchObject({ title: 'Nueva iniciativa en tu tablero · TEMO-031', body: 'Producto' });
    expect(build('OVERRIDE')).toMatchObject({ title: '⚠️ Avance excepcional en TEMO-012', body: 'Tech' });
    expect(build('BLOCKED')).toMatchObject({ title: '⛔ TEMO-012 está parada', body: 'Tech' });
    expect(build('SLE_AT_RISK')).toMatchObject({ title: '⏳ TEMO-012 al 75 % de su SLE', body: 'Desarrollo' });
  });

  it('una tarea sin iniciativa muestra solo el área', () => {
    expect(buildPushMessage('TASK_ASSIGNED', { taskId: TASK_ID, department: 'QA', initiativeId: null }).body).toBe('QA');
  });

  it('el porcentaje de SLE se redondea hacia abajo y nunca pasa de 100 en el texto', () => {
    expect(buildPushMessage('SLE_AT_RISK', { initiativeId: 'TEMO-1', stageKey: 'QA', percent: 87.9 }).title).toBe(
      '⏳ TEMO-1 al 87 % de su SLE',
    );
    expect(buildPushMessage('SLE_AT_RISK', { initiativeId: 'TEMO-1', stageKey: 'QA', percent: 140 }).title).toBe(
      '⏳ TEMO-1 al 100 % de su SLE',
    );
  });

  it('cada aviso abre la vista que fija la spec, siempre con una ruta relativa', () => {
    expect(build('TASK_ASSIGNED').url).toBe('/tareas');
    expect(build('INITIATIVE_ASSIGNED').url).toBe('/board?iniciativa=TEMO-012');
    expect(build('DEPENDENCY_INCOMING').url).toBe('/notifications');
    expect(build('REQUEST_INCOMING').url).toBe('/dependencias');
    expect(build('DEPENDENCY_RESOLVED').url).toBe('/board?iniciativa=TEMO-012');
    expect(build('REQUEST_RESOLVED').url).toBe('/dependencias');
    for (const kind of ['ENTERED_BOARD', 'INITIATIVE_CREATED', 'OVERRIDE', 'BLOCKED', 'SLE_AT_RISK'] as const) {
      expect(build(kind).url).toBe(`/board?iniciativa=${CONTEXTS[kind].initiativeId}`);
    }
    for (const kind of PUSH_EVENT_KINDS) {
      expect(build(kind).url).toMatch(/^\/[^/]/);
    }
  });

  it('el código de iniciativa va codificado en la URL', () => {
    expect(buildPushMessage('BLOCKED', { initiativeId: 'TEMO-1&x=<y>', department: 'QA' }).url).toBe(
      '/board?iniciativa=TEMO-1%26x%3D%3Cy%3E',
    );
  });

  it('el tag identifica el tipo y el objeto, para sustituir avisos del mismo objeto', () => {
    expect(build('TASK_ASSIGNED').tag).toBe(`TASK_ASSIGNED:${TASK_ID}`);
    expect(build('REQUEST_INCOMING').tag).toBe(`REQUEST_INCOMING:${REQUEST_ID}`);
    expect(build('DEPENDENCY_INCOMING').tag).toBe(`DEPENDENCY_INCOMING:${DEPENDENCY_ID}`);
    expect(build('BLOCKED').tag).toBe('BLOCKED:TEMO-012');
    expect(build('SLE_AT_RISK').tag).toBe('SLE_AT_RISK:TEMO-012:DEV');
  });
});

describe('contenido mínimo (CA-07)', () => {
  const SENTINELS = {
    title: 'CENTINELA-TITULO Paciente Juana Pérez',
    description: 'CENTINELA-DESCRIPCION historia clínica',
    name: 'CENTINELA-NOMBRE Clara Ruiz',
    email: 'centinela@example.com',
    resolutionNotes: 'CENTINELA-NOTAS',
  };

  it('aunque se cuelen campos con texto libre, ningún aviso los muestra', () => {
    for (const kind of PUSH_EVENT_KINDS) {
      // Simula un llamador descuidado que pasa la fila completa en vez del contexto mínimo.
      const leaky = { ...CONTEXTS[kind], ...SENTINELS } as PushMessageContext[typeof kind];
      const payload = JSON.stringify(buildPushMessage(kind, leaky));
      for (const sentinel of Object.values(SENTINELS)) {
        expect(payload).not.toContain(sentinel);
      }
    }
  });

  it('el mensaje solo tiene los cinco campos del contrato', () => {
    for (const kind of PUSH_EVENT_KINDS) {
      expect(Object.keys(build(kind)).sort()).toEqual(['body', 'kind', 'tag', 'title', 'url']);
    }
  });

  it('el tipo del contexto no admite título ni descripción', () => {
    // @ts-expect-error — el contexto de un bloqueo no tiene `title`.
    const withTitle: PushMessageContext['BLOCKED'] = { initiativeId: 'TEMO-1', department: 'QA', title: 'x' };
    // @ts-expect-error — el contexto de una petición no tiene `description`.
    const withDescription: PushMessageContext['REQUEST_INCOMING'] = { requestId: 'r', fromDepartment: 'QA', toDepartment: 'LEGAL', description: 'x' };
    expect(withTitle).toBeDefined();
    expect(withDescription).toBeDefined();
  });
});
