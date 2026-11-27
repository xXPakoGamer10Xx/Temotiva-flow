import { describe, expect, it } from 'vitest';
import { STAGE_KEYS } from './enums';
import {
  STAGE_SIGNOFF_MATRIX,
  isSignoffId,
  isSignoffSatisfied,
  requirementFor,
  signoffId,
  validateSignoffPayload,
} from './signoffs';

describe('matriz de aprobaciones por fase (spec 005 §5.2)', () => {
  it('cubre las 7 fases con las áreas exactas', () => {
    const departments = Object.fromEntries(
      STAGE_KEYS.map((key) => [key, STAGE_SIGNOFF_MATRIX[key].map((entry) => entry.department)]),
    );
    expect(departments).toEqual({
      IDEATION: ['PSYCHOLOGY', 'PRODUCT'],
      FEASIBILITY: ['LEGAL', 'CYBER', 'TECH'],
      CO_DESIGN: ['DESIGN'],
      READY: ['LEGAL', 'PRODUCT', 'PSYCHOLOGY'],
      DEV: ['TECH'],
      QA: ['CYBER', 'QA'],
      PROD: ['TECH'],
    });
  });

  it('solo Viabilidad tiene requisitos extra', () => {
    expect(requirementFor('FEASIBILITY', 'LEGAL')).toBe('NOTE_OR_NO_OBSERVATIONS');
    expect(requirementFor('FEASIBILITY', 'CYBER')).toBe('NOTE_OR_NO_OBSERVATIONS');
    expect(requirementFor('FEASIBILITY', 'TECH')).toBe('TSHIRT');
    expect(requirementFor('READY', 'LEGAL')).toBe('NONE');
    expect(requirementFor('DEV', 'LEGAL')).toBeNull();
  });

  it('genera ids estables y reconocibles', () => {
    expect(signoffId('FEASIBILITY', 'LEGAL')).toBe('SIGNOFF:FEASIBILITY:LEGAL');
    expect(isSignoffId('SIGNOFF:DEV:TECH')).toBe(true);
    expect(isSignoffId('CHK-DEV-1')).toBe(false);
  });
});

describe('validateSignoffPayload', () => {
  it('Legal/Ciber exigen nota o «Sin observaciones»', () => {
    expect(validateSignoffPayload('NOTE_OR_NO_OBSERVATIONS', {})).toMatch(/Sin observaciones/);
    expect(validateSignoffPayload('NOTE_OR_NO_OBSERVATIONS', { note: '   ' })).toMatch(/Sin observaciones/);
    expect(validateSignoffPayload('NOTE_OR_NO_OBSERVATIONS', { noObservations: true })).toBeNull();
    expect(validateSignoffPayload('NOTE_OR_NO_OBSERVATIONS', { note: 'Requiere DPIA previa.' })).toBeNull();
  });

  it('rechaza nota y «Sin observaciones» a la vez', () => {
    expect(validateSignoffPayload('NOTE_OR_NO_OBSERVATIONS', { note: 'Requiere DPIA previa.', noObservations: true })).toMatch(
      /no las dos/,
    );
  });

  it('acota la longitud de la nota', () => {
    expect(validateSignoffPayload('NONE', { note: 'corta' })).toMatch(/entre 10/);
    expect(validateSignoffPayload('NONE', { note: 'x'.repeat(1001) })).toMatch(/entre 10/);
  });

  it('Tech exige talla T-shirt válida', () => {
    expect(validateSignoffPayload('TSHIRT', {})).toMatch(/T-shirt/);
    expect(validateSignoffPayload('TSHIRT', { tshirtSize: 'M' })).toBeNull();
    // @ts-expect-error talla fuera del enum
    expect(validateSignoffPayload('TSHIRT', { tshirtSize: 'XXL' })).toMatch(/XS, S, M, L o XL/);
  });

  it('una aprobación sin requisito no pide nada más', () => {
    expect(validateSignoffPayload('NONE', {})).toBeNull();
  });
});

describe('isSignoffSatisfied', () => {
  const base = { isApproved: true, note: null, noObservations: false, tshirtSize: null };
  it('exige estar aprobada y con su requisito', () => {
    expect(isSignoffSatisfied('NONE', undefined)).toBe(false);
    expect(isSignoffSatisfied('NONE', { ...base, isApproved: false })).toBe(false);
    expect(isSignoffSatisfied('NONE', base)).toBe(true);
    expect(isSignoffSatisfied('TSHIRT', base)).toBe(false);
    expect(isSignoffSatisfied('TSHIRT', { ...base, tshirtSize: 'L' })).toBe(true);
  });
});
