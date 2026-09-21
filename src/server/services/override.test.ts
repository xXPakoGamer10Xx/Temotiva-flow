import { describe, expect, it } from 'vitest';
import { OVERRIDE_SIGNATURE } from '@/domain/rules';
import { advanceStage, type OverrideInput } from './initiatives';
import { evaluateGate } from './gate';
import { TEST_NOW, makeInitiative, makeSession, makeTestStore } from './test-utils';
import type { InMemoryDataStore } from '@/server/repositories/in-memory';

/**
 * Invariante 2 (AGENTS.md §5.2): el avance excepcional es la única forma de
 * saltarse una compuerta, y nunca es silencioso ni opaco.
 */

const REASON = 'El cliente piloto B2B necesita el prototipo antes del comité del viernes.';
const RISK = 'Asumimos posible retrabajo de la interfaz si Legal exige doble consentimiento.';

async function pendingIds(store: InMemoryDataStore, initiativeId: string): Promise<string[]> {
  const initiative = await store.initiativeById(initiativeId);
  if (!initiative) throw new Error('iniciativa no encontrada');
  const gate = await evaluateGate(store, initiative);
  return gate.pending.map((item) => item.id);
}

function overrideWith(overrides: Partial<OverrideInput>, acknowledged: string[]): OverrideInput {
  return {
    reason: REASON,
    riskAccepted: RISK,
    signature: OVERRIDE_SIGNATURE,
    acknowledgedPendingIds: acknowledged,
    ...overrides,
  };
}

describe('avance excepcional', () => {
  it('lo rechaza para un MEMBER', async () => {
    const { store } = makeTestStore();
    const session = makeSession('LEGAL', 'MEMBER');
    const acknowledged = await pendingIds(store, 'TEMO-500');

    await expect(
      advanceStage(store, session, {
        initiativeId: 'TEMO-500',
        override: overrideWith({}, acknowledged),
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/responsable|Dirección/i);
  });

  it('lo rechaza para un LEAD de otra área', async () => {
    const { store } = makeTestStore();
    const session = makeSession('DESIGN', 'LEAD');
    const acknowledged = await pendingIds(store, 'TEMO-500');

    await expect(
      advanceStage(store, session, {
        initiativeId: 'TEMO-500',
        override: overrideWith({}, acknowledged),
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/área propietaria|Dirección/i);
  });

  it('exige motivo y riesgo de al menos 30 caracteres', async () => {
    const { store } = makeTestStore();
    const session = makeSession('LEGAL', 'LEAD');
    const acknowledged = await pendingIds(store, 'TEMO-500');

    await expect(
      advanceStage(store, session, {
        initiativeId: 'TEMO-500',
        override: overrideWith({ reason: 'porque sí' }, acknowledged),
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/motivo/i);

    await expect(
      advanceStage(store, session, {
        initiativeId: 'TEMO-500',
        override: overrideWith({ riskAccepted: 'ninguno' }, acknowledged),
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/riesgo/i);
  });

  it('exige la firma literal CONFIRMAR EXCEPCION', async () => {
    const { store } = makeTestStore();
    const session = makeSession('LEGAL', 'LEAD');
    const acknowledged = await pendingIds(store, 'TEMO-500');

    await expect(
      advanceStage(store, session, {
        initiativeId: 'TEMO-500',
        override: overrideWith({ signature: 'confirmo' }, acknowledged),
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/CONFIRMAR EXCEPCION/);
  });

  it('exige reconocer exactamente los requisitos incumplidos', async () => {
    const { store } = makeTestStore();
    const session = makeSession('LEGAL', 'LEAD');
    const acknowledged = await pendingIds(store, 'TEMO-500');

    await expect(
      advanceStage(store, session, {
        initiativeId: 'TEMO-500',
        override: overrideWith({}, acknowledged.slice(1)),
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/reconocer/i);
  });

  it('firmado por el LEAD del área avanza y deja la excepción en la caja negra', async () => {
    const { store } = makeTestStore();
    const session = makeSession('LEGAL', 'LEAD');
    const acknowledged = await pendingIds(store, 'TEMO-500');

    const result = await advanceStage(store, session, {
      initiativeId: 'TEMO-500',
      override: overrideWith({}, acknowledged),
      request: { ip: '10.20.0.14', userAgent: 'Mozilla/5.0 (pruebas)' },
      now: TEST_NOW,
    });

    expect(result.status).toBe('ADVANCED');
    if (result.status !== 'ADVANCED') throw new Error('se esperaba avance');
    expect(result.overridden).toBe(true);

    const log = await store.listActivityLog('TEMO-500');
    const override = log.find((entry) => entry.actionType === 'EXCEPTION_OVERRIDE');
    expect(override).toBeDefined();
    expect(override?.userId).toBe(session.userId);
    expect(override?.overrideMetadata?.reason).toBe(REASON);
    expect(override?.overrideMetadata?.riskAccepted).toBe(RISK);
    expect(override?.overrideMetadata?.authorizedByRole).toBe('LEAD');
    // No repudio: IP y dispositivo de la firma quedan registrados.
    expect(override?.overrideMetadata?.ip).toBe('10.20.0.14');
    expect(override?.overrideMetadata?.userAgent).toContain('Mozilla');
    expect(override?.overrideMetadata?.pendingItems.length).toBe(acknowledged.length);

    // La transición también se registra, además de la excepción.
    expect(log.some((entry) => entry.actionType === 'STAGE_TRANSITION')).toBe(true);
  });

  it('Dirección puede firmarlo sobre cualquier área', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    const session = makeSession('TECH', 'EXECUTIVE');
    const acknowledged = await pendingIds(store, 'TEMO-500');

    const result = await advanceStage(store, session, {
      initiativeId: 'TEMO-500',
      override: overrideWith({}, acknowledged),
      now: TEST_NOW,
    });

    expect(result.status).toBe('ADVANCED');
  });
});
