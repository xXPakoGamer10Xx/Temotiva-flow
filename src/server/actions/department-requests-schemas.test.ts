import { describe, expect, it } from 'vitest';
import {
  createDepartmentRequestSchema,
  resolveDepartmentRequestSchema,
  startDepartmentRequestSchema,
} from './department-requests-schemas';

/**
 * Frontera de entrada de las Server Actions del buzón (spec 001, T-07;
 * constitución §4): entradas inválidas, campos ausentes y valores fuera de
 * rango se rechazan con un mensaje en español antes de llegar al servicio.
 */

const REQUEST_ID = '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f';

const validCreate = {
  sourceDepartment: 'LEGAL',
  targetDepartment: 'CYBER',
  helpType: 'VALIDATION',
  title: '  Revisión del cifrado de datos clínicos  ',
  description: 'Necesitamos validar el cifrado en reposo antes de firmar.',
  blocksInitiative: true,
  initiativeId: 'TEMO-012',
};

/** El primer mensaje de error, como lo mostraría `runAction`. */
function firstError(result: { success: boolean; error?: { issues: { message: string }[] } }): string {
  expect(result.success).toBe(false);
  return result.error?.issues[0]?.message ?? '';
}

/** Ningún mensaje de Zod en inglés llega a la interfaz (RF-15). */
function expectSpanish(message: string): void {
  expect(message.length).toBeGreaterThan(5);
  expect(message).not.toMatch(/invalid|expected|required|received|too (small|big)/i);
}

describe('createDepartmentRequestSchema', () => {
  it('acepta una entrada válida y recorta los textos', () => {
    const parsed = createDepartmentRequestSchema.parse(validCreate);
    expect(parsed).toEqual({ ...validCreate, title: 'Revisión del cifrado de datos clínicos' });
  });

  it('el bloqueo es falso por defecto y la iniciativa es opcional', () => {
    const { blocksInitiative: _b, initiativeId: _i, ...minimal } = validCreate;
    const parsed = createDepartmentRequestSchema.parse(minimal);
    expect(parsed.blocksInitiative).toBe(false);
    expect(parsed.initiativeId).toBeUndefined();
    expect(createDepartmentRequestSchema.parse({ ...minimal, initiativeId: null }).initiativeId).toBeNull();
  });

  it('descarta campos que el cliente no debe decidir (autor, estado, fechas)', () => {
    const parsed = createDepartmentRequestSchema.parse({
      ...validCreate,
      requestedBy: 'otra-persona',
      status: 'RESOLVED',
      createdAt: '2020-01-01T00:00:00.000Z',
    });
    expect(parsed).not.toHaveProperty('requestedBy');
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('createdAt');
  });

  it.each(['sourceDepartment', 'targetDepartment', 'helpType', 'title', 'description'] as const)(
    'rechaza la ausencia de %s con un mensaje en español',
    (field) => {
      const input: Record<string, unknown> = { ...validCreate };
      delete input[field];
      expectSpanish(firstError(createDepartmentRequestSchema.safeParse(input)));
    },
  );

  it.each([
    ['título de 7 caracteres', { title: '1234567' }],
    ['título de 121 caracteres', { title: 'x'.repeat(121) }],
    ['título que solo tiene espacios', { title: '          ' }],
    ['descripción de 14 caracteres', { description: '12345678901234' }],
    ['tipo de necesidad fuera de HELP_TYPES_V1 (AC-10)', { helpType: 'UNBLOCK' }],
    ['tipo de necesidad inventado', { helpType: 'APPROVAL' }],
    ['área de origen inexistente', { sourceDepartment: 'ADMIN' }],
    ['área destino inexistente', { targetDepartment: 'ADMIN' }],
    ['identificador de iniciativa mal formado', { initiativeId: 'abc' }],
    ['bloqueo que no es booleano', { blocksInitiative: 'sí' }],
  ])('rechaza %s', (_label, overrides) => {
    expectSpanish(firstError(createDepartmentRequestSchema.safeParse({ ...validCreate, ...overrides })));
  });

  it('acepta exactamente los límites: título de 8 y 120, descripción de 15', () => {
    for (const title of ['12345678', 'x'.repeat(120)]) {
      expect(createDepartmentRequestSchema.safeParse({ ...validCreate, title }).success).toBe(true);
    }
    expect(createDepartmentRequestSchema.safeParse({ ...validCreate, description: '123456789012345' }).success).toBe(
      true,
    );
  });
});

describe('startDepartmentRequestSchema', () => {
  it('exige un identificador UUID', () => {
    expect(startDepartmentRequestSchema.parse({ requestId: REQUEST_ID })).toEqual({ requestId: REQUEST_ID });
    expectSpanish(firstError(startDepartmentRequestSchema.safeParse({})));
    expectSpanish(firstError(startDepartmentRequestSchema.safeParse({ requestId: 'req-1' })));
  });
});

describe('resolveDepartmentRequestSchema', () => {
  it('exige identificador y una respuesta de al menos 5 caracteres, recortada', () => {
    expect(resolveDepartmentRequestSchema.parse({ requestId: REQUEST_ID, resolutionNotes: '  Hecho.  ' })).toEqual({
      requestId: REQUEST_ID,
      resolutionNotes: 'Hecho.',
    });
    expectSpanish(firstError(resolveDepartmentRequestSchema.safeParse({ requestId: REQUEST_ID })));
    expectSpanish(
      firstError(resolveDepartmentRequestSchema.safeParse({ requestId: REQUEST_ID, resolutionNotes: '  ok  ' })),
    );
    expectSpanish(firstError(resolveDepartmentRequestSchema.safeParse({ requestId: 'x', resolutionNotes: 'Hecho.' })));
  });
});
