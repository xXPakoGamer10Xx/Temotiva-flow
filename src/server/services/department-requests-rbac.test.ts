import { describe, expect, it } from 'vitest';
import type { DepartmentRequest } from '@/domain/department-request';
import {
  canManageDepartmentRequest,
  canViewDepartmentRequest,
  canViewInitiativeDependencyInInbox,
} from './rbac';
import { makeSession, makeUser, sessionOf } from './test-utils';

/**
 * Need-to-Know del buzón de Dependencias (spec 001 §5, RF-5, RF-8, RF-16).
 * Cubre MEMBER implicado, MEMBER ajeno, LEAD y EXECUTIVE (constitución §3).
 */

/** Legal pide ayuda a Ciberseguridad (AC-1). */
const request: Pick<DepartmentRequest, 'sourceDepartment' | 'targetDepartment'> = {
  sourceDepartment: 'LEGAL',
  targetDepartment: 'CYBER',
};

describe('ver una petición entre áreas', () => {
  it('la ven el área origen y el área destino, también como MEMBER', () => {
    expect(canViewDepartmentRequest(makeSession('LEGAL', 'MEMBER'), request)).toBe(true);
    expect(canViewDepartmentRequest(makeSession('CYBER', 'MEMBER'), request)).toBe(true);
  });

  it('no la ve un MEMBER ni un LEAD de un área ajena', () => {
    expect(canViewDepartmentRequest(makeSession('PRODUCT', 'MEMBER'), request)).toBe(false);
    expect(canViewDepartmentRequest(makeSession('PRODUCT', 'LEAD'), request)).toBe(false);
  });

  it('con varias áreas basta con que una esté implicada', () => {
    expect(canViewDepartmentRequest(makeSession(['PRODUCT', 'CYBER'], 'LEAD'), request)).toBe(true);
  });

  it('EXECUTIVE las ve todas', () => {
    expect(canViewDepartmentRequest(makeSession([], 'EXECUTIVE'), request)).toBe(true);
  });
});

describe('gestionar (tomar o resolver) una petición entre áreas', () => {
  it('solo el área destino, de cualquier rol', () => {
    expect(canManageDepartmentRequest(makeSession('CYBER', 'MEMBER'), request)).toBe(true);
    expect(canManageDepartmentRequest(makeSession('CYBER', 'LEAD'), request)).toBe(true);
  });

  it('el área origen la ve pero no puede darse por atendida (AC-4)', () => {
    expect(canManageDepartmentRequest(makeSession('LEGAL', 'MEMBER'), request)).toBe(false);
    expect(canManageDepartmentRequest(makeSession('LEGAL', 'LEAD'), request)).toBe(false);
  });

  it('un área ajena no la gestiona; EXECUTIVE sí', () => {
    expect(canManageDepartmentRequest(makeSession('PRODUCT', 'LEAD'), request)).toBe(false);
    expect(canManageDepartmentRequest(makeSession([], 'EXECUTIVE'), request)).toBe(true);
  });
});

describe('ver una dependencia 🆘 de iniciativa en el buzón (RF-16)', () => {
  const requester = makeUser({ id: 'u-requester', departments: ['PRODUCT'], role: 'MEMBER' });
  const dependency = { targetDepartment: 'LEGAL' as const, requestedBy: requester.id };
  const ownedByProduct = { ownerDepartment: 'PRODUCT' as const };
  const movedToTech = { ownerDepartment: 'TECH' as const };

  it('entrante para el área destino', () => {
    expect(canViewInitiativeDependencyInInbox(makeSession('LEGAL', 'MEMBER'), dependency, ownedByProduct)).toBe(true);
  });

  it('saliente para el área dueña actual de la iniciativa', () => {
    expect(canViewInitiativeDependencyInInbox(makeSession('PRODUCT', 'MEMBER'), dependency, ownedByProduct)).toBe(true);
    expect(canViewInitiativeDependencyInInbox(makeSession('TECH', 'MEMBER'), dependency, movedToTech)).toBe(true);
  });

  it('quien la abrió la sigue viendo aunque la iniciativa cambie de área dueña', () => {
    expect(canViewInitiativeDependencyInInbox(sessionOf(requester), dependency, movedToTech)).toBe(true);
  });

  it('pero sus compañeros del área que ya no es dueña dejan de verla', () => {
    expect(canViewInitiativeDependencyInInbox(makeSession('PRODUCT', 'LEAD'), dependency, movedToTech)).toBe(false);
  });

  it('no la ve un área ajena; EXECUTIVE sí', () => {
    expect(canViewInitiativeDependencyInInbox(makeSession('FINANCE', 'LEAD'), dependency, ownedByProduct)).toBe(false);
    expect(canViewInitiativeDependencyInInbox(makeSession([], 'EXECUTIVE'), dependency, ownedByProduct)).toBe(true);
  });
});
