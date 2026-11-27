import { describe, expect, it } from 'vitest';
import { STAGE_ID_BY_KEY } from '@/domain/workflow';
import { assertInitiativeOpen } from './blocking';
import { canFinalizeInitiative, canManageCustomCheck, canSignoffStage } from './rbac';
import { makeInitiative, makeSession } from './test-utils';

/** Matriz de permisos de la spec 005 (T-04). */
describe('canSignoffStage', () => {
  it('aprueba quien pertenece al área, sea cual sea su rol', () => {
    expect(canSignoffStage(makeSession('LEGAL', 'MEMBER'), 'LEGAL')).toBe(true);
    expect(canSignoffStage(makeSession('LEGAL', 'LEAD'), 'LEGAL')).toBe(true);
  });

  it('no aprueba un MEMBER ni un LEAD de otra área', () => {
    expect(canSignoffStage(makeSession('DESIGN', 'MEMBER'), 'LEGAL')).toBe(false);
    expect(canSignoffStage(makeSession('DESIGN', 'LEAD'), 'LEGAL')).toBe(false);
  });

  it('Dirección aprueba en nombre de cualquier área', () => {
    expect(canSignoffStage(makeSession('PRODUCT', 'EXECUTIVE'), 'CYBER')).toBe(true);
  });

  it('quien lleva Tech y Ciberseguridad aprueba ambas casillas', () => {
    const session = makeSession(['TECH', 'CYBER'], 'MEMBER');
    expect(canSignoffStage(session, 'TECH')).toBe(true);
    expect(canSignoffStage(session, 'CYBER')).toBe(true);
    expect(canSignoffStage(session, 'LEGAL')).toBe(false);
  });
});

describe('canManageCustomCheck', () => {
  const initiative = makeInitiative({ ownerDepartment: 'LEGAL', currentStageId: STAGE_ID_BY_KEY.FEASIBILITY });

  it('el área propietaria y las áreas que aprueban la fase', () => {
    expect(canManageCustomCheck(makeSession('LEGAL', 'MEMBER'), initiative, 'FEASIBILITY')).toBe(true);
    expect(canManageCustomCheck(makeSession('TECH', 'MEMBER'), initiative, 'FEASIBILITY')).toBe(true);
    expect(canManageCustomCheck(makeSession('CYBER', 'MEMBER'), initiative, 'FEASIBILITY')).toBe(true);
  });

  it('un área ajena a la fase no puede, Dirección sí', () => {
    expect(canManageCustomCheck(makeSession('MARKETING', 'LEAD'), initiative, 'FEASIBILITY')).toBe(false);
    expect(canManageCustomCheck(makeSession('MARKETING', 'EXECUTIVE'), initiative, 'FEASIBILITY')).toBe(true);
  });
});

describe('canFinalizeInitiative', () => {
  const initiative = makeInitiative({ ownerDepartment: 'TECH', currentStageId: STAGE_ID_BY_KEY.PROD });
  it('Tech (propietaria de Producción) o Dirección', () => {
    expect(canFinalizeInitiative(makeSession('TECH', 'MEMBER'), initiative)).toBe(true);
    expect(canFinalizeInitiative(makeSession('PRODUCT', 'LEAD'), initiative)).toBe(false);
    expect(canFinalizeInitiative(makeSession('PRODUCT', 'EXECUTIVE'), initiative)).toBe(true);
  });
});

describe('assertInitiativeOpen', () => {
  it('rechaza archivadas y finalizadas', () => {
    expect(() => assertInitiativeOpen(makeInitiative())).not.toThrow();
    expect(() => assertInitiativeOpen(makeInitiative({ isArchived: true }))).toThrow(/archivada/);
    expect(() =>
      assertInitiativeOpen(makeInitiative({ finalizedAt: '2026-11-26T10:00:00.000Z', finalizedBy: 'u-x' })),
    ).toThrow(/finalizada/);
  });
});
