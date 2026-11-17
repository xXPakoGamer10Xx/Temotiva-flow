import { describe, expect, it } from 'vitest';
import { canAttachToDepartmentRequest, canManageDepartmentRequest, canReassignDepartmentRequest } from './rbac';
import { makeSession, makeUser, sessionOf } from './test-utils';

/** Matriz de permisos de la spec 004 §7 (T-03): peticiones dirigidas a una persona. */

const ana = makeUser({ departments: ['CYBER'], role: 'MEMBER' });
const luis = makeUser({ departments: ['CYBER'], role: 'MEMBER' });
const cyberLead = makeUser({ departments: ['CYBER'], role: 'LEAD' });
const legalLead = makeUser({ departments: ['LEGAL'], role: 'LEAD' });
const executive = makeSession([], 'EXECUTIVE');

const request = { sourceDepartment: 'LEGAL', targetDepartment: 'CYBER', status: 'PENDING' } as const;

describe('canManageDepartmentRequest con persona destinataria', () => {
  it('sin persona se mantiene la regla de la spec 001: cualquiera del área destino', () => {
    expect(canManageDepartmentRequest(sessionOf(luis), request)).toBe(true);
    expect(canManageDepartmentRequest(sessionOf(luis), request, null)).toBe(true);
  });

  it('con persona: la persona, el LEAD del área destino y Dirección', () => {
    expect(canManageDepartmentRequest(sessionOf(ana), request, ana.id)).toBe(true);
    expect(canManageDepartmentRequest(sessionOf(cyberLead), request, ana.id)).toBe(true);
    expect(canManageDepartmentRequest(executive, request, ana.id)).toBe(true);
  });

  it('con persona: otro miembro del área destino o el área origen no', () => {
    expect(canManageDepartmentRequest(sessionOf(luis), request, ana.id)).toBe(false);
    expect(canManageDepartmentRequest(sessionOf(legalLead), request, ana.id)).toBe(false);
  });

  it('quien no lleva el área destino no la atiende aunque figure como destinataria', () => {
    const multi = makeUser({ departments: ['LEGAL'], role: 'LEAD' });
    expect(canManageDepartmentRequest(sessionOf(multi), request, multi.id)).toBe(false);
  });

  it('adjuntar a la respuesta sigue la misma regla', () => {
    expect(canAttachToDepartmentRequest(sessionOf(ana), request, 'RESPONSE', ana.id)).toBe(true);
    expect(canAttachToDepartmentRequest(sessionOf(luis), request, 'RESPONSE', ana.id)).toBe(false);
    expect(canAttachToDepartmentRequest(sessionOf(luis), request, 'RESPONSE')).toBe(true);
  });
});

describe('canReassignDepartmentRequest', () => {
  it('LEAD del área destino y Dirección, mientras no esté resuelta', () => {
    expect(canReassignDepartmentRequest(sessionOf(cyberLead), request)).toBe(true);
    expect(canReassignDepartmentRequest(executive, { ...request, status: 'IN_PROGRESS' })).toBe(true);
    expect(canReassignDepartmentRequest(sessionOf(cyberLead), { ...request, status: 'RESOLVED' })).toBe(false);
    expect(canReassignDepartmentRequest(executive, { ...request, status: 'RESOLVED' })).toBe(false);
  });

  it('ni miembros del área destino, ni la persona destinataria, ni el LEAD del área origen', () => {
    expect(canReassignDepartmentRequest(sessionOf(ana), request)).toBe(false);
    expect(canReassignDepartmentRequest(sessionOf(legalLead), request)).toBe(false);
  });
});
