import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION_TYPES, type Department } from './enums';
import { ACTION_TYPE_LABELS } from './labels';
import { effectiveTargetUserId, isEligibleRequestTarget } from './department-request';

/** Contrato de dominio de la spec 004 (peticiones dirigidas a una persona), T-01. */

interface Candidate {
  id: string;
  isActive: boolean;
  isAnonymized: boolean;
  departments: Department[];
}

const ana: Candidate = { id: 'u-ana', isActive: true, isAnonymized: false, departments: ['LEGAL', 'HR'] };

function usersOf(...users: Candidate[]): Map<string, Candidate> {
  return new Map(users.map((user) => [user.id, user]));
}

describe('isEligibleRequestTarget', () => {
  it('admite a una persona activa del área', () => {
    expect(isEligibleRequestTarget(ana, 'LEGAL')).toBe(true);
    expect(isEligibleRequestTarget(ana, 'HR')).toBe(true);
  });

  it('rechaza a quien no lleva el área, está inactiva o anonimizada', () => {
    expect(isEligibleRequestTarget({ ...ana, departments: ['LEGAL'] }, 'CYBER')).toBe(false);
    expect(isEligibleRequestTarget({ ...ana, departments: ['LEGAL'], isActive: false }, 'LEGAL')).toBe(false);
    expect(isEligibleRequestTarget({ ...ana, departments: ['LEGAL'], isAnonymized: true }, 'LEGAL')).toBe(false);
  });
});

describe('effectiveTargetUserId (RF-6)', () => {
  const request = { targetUserId: 'u-ana', targetDepartment: 'LEGAL' as const };

  it('sin persona, la petición es del área', () => {
    expect(effectiveTargetUserId({ ...request, targetUserId: null }, usersOf(ana))).toBeNull();
  });

  it('devuelve a la persona mientras siga siendo elegible', () => {
    expect(effectiveTargetUserId(request, usersOf(ana))).toBe('u-ana');
  });

  it('vuelve a ser del área si la persona se da de baja, se anonimiza, pierde el área o no existe', () => {
    expect(effectiveTargetUserId(request, usersOf({ ...ana, isActive: false }))).toBeNull();
    expect(effectiveTargetUserId(request, usersOf({ ...ana, isAnonymized: true }))).toBeNull();
    expect(effectiveTargetUserId(request, usersOf({ ...ana, departments: ['HR'] }))).toBeNull();
    expect(effectiveTargetUserId(request, usersOf())).toBeNull();
  });
});

describe('contrato de la spec 004', () => {
  it('registra el evento de reasignación con etiqueta propia', () => {
    expect(ACTION_TYPES).toContain('DEPARTMENT_REQUEST_REASSIGNED');
    expect(ACTION_TYPE_LABELS.DEPARTMENT_REQUEST_REASSIGNED.length).toBeGreaterThan(5);
  });

  it('añade la columna opcional en una migración nueva, aplicada después de la 09', () => {
    const sql = readFileSync(join(process.cwd(), 'db', '10-department-request-target-user.sql'), 'utf8');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES users\(id\)/);
    expect(sql).not.toMatch(/target_user_id UUID[^;]*NOT NULL/);
    const setup = readFileSync(join(process.cwd(), 'scripts', 'setup-db.ts'), 'utf8');
    expect(setup.indexOf("'10-department-request-target-user.sql'")).toBeGreaterThan(setup.indexOf("'09-tech-sprints.sql'"));
  });

  it('no edita la migración 06 ya publicada', () => {
    const sql06 = readFileSync(join(process.cwd(), 'db', '06-department-requests.sql'), 'utf8');
    expect(sql06).not.toMatch(/target_user_id/);
  });
});
