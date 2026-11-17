import { describe, expect, it } from 'vitest';
import { createDepartmentRequestSchema, reassignDepartmentRequestSchema } from './department-requests-schemas';

/** Spec 004 (T-05): frontera de entrada de la persona destinataria y de la reasignación. */

const REQUEST_ID = '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f';
const PERSON_ID = '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0101';

const validCreate = {
  sourceDepartment: 'PRODUCT',
  targetDepartment: 'LEGAL',
  helpType: 'VALIDATION',
  title: 'Revisión del consentimiento',
  description: 'Necesitamos validar el texto legal del consentimiento.',
};

function messageOf(result: { success: boolean; error?: { issues: { message: string }[] } }): string {
  expect(result.success).toBe(false);
  return result.error?.issues[0]?.message ?? '';
}

describe('createDepartmentRequestSchema — persona destinataria', () => {
  it('es opcional y admite null', () => {
    expect(createDepartmentRequestSchema.parse(validCreate).targetUserId).toBeUndefined();
    expect(createDepartmentRequestSchema.parse({ ...validCreate, targetUserId: null }).targetUserId).toBeNull();
    expect(createDepartmentRequestSchema.parse({ ...validCreate, targetUserId: PERSON_ID }).targetUserId).toBe(PERSON_ID);
  });

  it('rechaza lo que no es un UUID, en español', () => {
    expect(messageOf(createDepartmentRequestSchema.safeParse({ ...validCreate, targetUserId: 'ana@temotiva.com' }))).toBe(
      'Elige una persona válida.',
    );
  });
});

describe('reassignDepartmentRequestSchema', () => {
  const valid = { requestId: REQUEST_ID, targetUserId: PERSON_ID, reason: '  Ana está de vacaciones hasta el lunes.  ' };

  it('acepta una entrada válida, recorta el motivo y descarta campos ajenos', () => {
    expect(reassignDepartmentRequestSchema.parse({ ...valid, assigneeId: PERSON_ID, status: 'RESOLVED' })).toEqual({
      ...valid,
      reason: 'Ana está de vacaciones hasta el lunes.',
    });
  });

  it('exige motivo de 15 a 500 caracteres', () => {
    expect(messageOf(reassignDepartmentRequestSchema.safeParse({ ...valid, reason: 'corto' }))).toMatch(/entre 15 y 500/);
    expect(messageOf(reassignDepartmentRequestSchema.safeParse({ ...valid, reason: 'x'.repeat(501) }))).toMatch(/entre 15 y 500/);
  });

  it('exige identificadores válidos', () => {
    expect(reassignDepartmentRequestSchema.safeParse({ ...valid, targetUserId: '' }).success).toBe(false);
    expect(reassignDepartmentRequestSchema.safeParse({ ...valid, requestId: 'x' }).success).toBe(false);
  });
});
