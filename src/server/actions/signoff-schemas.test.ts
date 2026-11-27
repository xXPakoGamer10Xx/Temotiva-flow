import { describe, expect, it } from 'vitest';
import {
  addCustomCheckSchema,
  advanceNoteSchema,
  initiativeDescriptionSchema,
  setCustomCheckStateSchema,
  setStageSignoffSchema,
} from './signoff-schemas';

/** Fronteras de entrada de la spec 005 (constitución §4). */
const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : result.error?.issues[0]?.message;

describe('descripción y nota de avance', () => {
  it('la descripción es obligatoria y acotada', () => {
    expect(firstMessage(initiativeDescriptionSchema.safeParse(undefined))).toMatch(/obligatoria/);
    expect(firstMessage(initiativeDescriptionSchema.safeParse('   corta   '))).toMatch(/mínimo 20/);
    expect(firstMessage(initiativeDescriptionSchema.safeParse('x'.repeat(4001)))).toMatch(/máximo 4000/);
    expect(initiativeDescriptionSchema.safeParse('x'.repeat(20)).success).toBe(true);
  });

  it('la nota de avance es obligatoria y acotada', () => {
    expect(firstMessage(advanceNoteSchema.safeParse(undefined))).toMatch(/obligatoria/);
    expect(firstMessage(advanceNoteSchema.safeParse('x'.repeat(19)))).toMatch(/mínimo 20/);
    expect(firstMessage(advanceNoteSchema.safeParse('x'.repeat(2001)))).toMatch(/máximo 2000/);
    expect(advanceNoteSchema.parse(`  ${'x'.repeat(20)}  `)).toHaveLength(20);
  });
});

describe('setStageSignoffSchema', () => {
  const base = { initiativeId: 'TEMO-101', stageId: 2, department: 'LEGAL', approved: true };

  it('acepta una aprobación con «Sin observaciones» y descarta la identidad del cliente', () => {
    const parsed = setStageSignoffSchema.parse({ ...base, noObservations: true, approvedBy: 'otra-persona' });
    expect(parsed).not.toHaveProperty('approvedBy');
  });

  it('rechaza ids, áreas y tallas fuera de rango', () => {
    expect(setStageSignoffSchema.safeParse({ ...base, initiativeId: 'X-1' }).success).toBe(false);
    expect(setStageSignoffSchema.safeParse({ ...base, department: 'ADMIN' }).success).toBe(false);
    expect(firstMessage(setStageSignoffSchema.safeParse({ ...base, tshirtSize: 'XXL' }))).toMatch(/XS, S, M, L o XL/);
    expect(setStageSignoffSchema.safeParse({ ...base, approved: undefined }).success).toBe(false);
  });

  it('rechaza nota corta y nota con «Sin observaciones» a la vez', () => {
    expect(firstMessage(setStageSignoffSchema.safeParse({ ...base, note: 'corta' }))).toMatch(/entre 10/);
    expect(
      firstMessage(setStageSignoffSchema.safeParse({ ...base, note: 'Requiere DPIA previa.', noObservations: true })),
    ).toMatch(/no las dos/);
  });

  it('retirar no exige nada más', () => {
    expect(setStageSignoffSchema.safeParse({ ...base, approved: false }).success).toBe(true);
  });
});

describe('casillas adicionales', () => {
  it('valida enunciado, nota e id', () => {
    expect(addCustomCheckSchema.safeParse({ initiativeId: 'TEMO-1', label: 'ab' }).success).toBe(false);
    expect(addCustomCheckSchema.safeParse({ initiativeId: 'TEMO-1', label: 'Revisar', note: 'x'.repeat(301) }).success).toBe(
      false,
    );
    expect(addCustomCheckSchema.safeParse({ initiativeId: 'TEMO-1', label: 'Revisar contrato' }).success).toBe(true);
    expect(setCustomCheckStateSchema.safeParse({ checkId: 'no-uuid', isCompleted: true }).success).toBe(false);
  });
});
