import { describe, expect, it } from 'vitest';
import { STAGE_ID_BY_KEY, checklistItemId } from '@/domain/workflow';
import { setChecklistItemState } from './checklist';
import { anonymizeUser, grantAccess, setAccessActive, updateAccess, updateOwnProfile } from './access';
import { TEST_NOW, makeInitiative, makeSession, makeTestStore, makeUser, sessionOf } from './test-utils';

/**
 * Control de acceso verificado en el servidor (SEGURIDAD.md §4): la interfaz
 * puede ocultar botones, pero la frontera real está aquí.
 */
describe('permisos sobre la compuerta', () => {
  it('cada requisito lo marca su departamento responsable', async () => {
    const { store } = makeTestStore();
    // El primer requisito de Viabilidad es el dictamen RGPD, de Legal.
    const item = checklistItemId('FEASIBILITY', 1);

    await expect(
      setChecklistItemState(store, makeSession('DESIGN', 'LEAD'), {
        initiativeId: 'TEMO-500',
        checklistItemId: item,
        isCompleted: true,
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/Legal/i);

    const value = await setChecklistItemState(store, makeSession('LEGAL', 'MEMBER'), {
      initiativeId: 'TEMO-500',
      checklistItemId: item,
      isCompleted: true,
      now: TEST_NOW,
    });
    expect(value.isCompleted).toBe(true);
    expect(value.completedAt).toBe(TEST_NOW.toISOString());
  });

  it('quien lleva varias áreas puede marcar los requisitos de todas ellas', async () => {
    const { store } = makeTestStore();

    const value = await setChecklistItemState(store, makeSession(['TECH', 'LEGAL'], 'MEMBER'), {
      initiativeId: 'TEMO-500',
      checklistItemId: checklistItemId('FEASIBILITY', 1),
      isCompleted: true,
      now: TEST_NOW,
    });

    expect(value.isCompleted).toBe(true);
  });

  it('Dirección puede marcar cualquier requisito', async () => {
    const { store } = makeTestStore();

    const value = await setChecklistItemState(store, makeSession('DESIGN', 'EXECUTIVE'), {
      initiativeId: 'TEMO-500',
      checklistItemId: checklistItemId('FEASIBILITY', 1),
      isCompleted: true,
      now: TEST_NOW,
    });

    expect(value.isCompleted).toBe(true);
  });

  it('no se pueden marcar requisitos de otra fase', async () => {
    const { store } = makeTestStore([makeInitiative({ currentStageId: STAGE_ID_BY_KEY.FEASIBILITY })]);

    await expect(
      setChecklistItemState(store, makeSession('DESIGN', 'LEAD'), {
        initiativeId: 'TEMO-500',
        checklistItemId: checklistItemId('CO_DESIGN', 1),
        isCompleted: true,
        now: TEST_NOW,
      }),
    ).rejects.toThrow(/fase actual/i);
  });
});

/**
 * Jerarquía descendente de altas (DESIGN.md §8.3): Dirección da de alta a
 * cualquiera, cada responsable suma miembros a sus áreas y quien es miembro no
 * da de alta a nadie. Nadie otorga lo que no tiene.
 */
describe('alta de personas', () => {
  it('Dirección puede crear cualquier rol y repartir varias áreas', async () => {
    const { store } = makeTestStore([]);
    const director = makeSession('PRODUCT', 'EXECUTIVE');

    const supervisor = await grantAccess(store, director, {
      name: 'Beatriz Lorenzo',
      email: 'Beatriz.Lorenzo@Ejemplo.com ',
      departments: ['HR', 'FINANCE'],
      role: 'LEAD',
    });

    expect(supervisor.role).toBe('LEAD');
    expect(supervisor.departments).toEqual(['HR', 'FINANCE']);
    // El correo se normaliza: la allowlist compara en minúsculas.
    expect(supervisor.email).toBe('beatriz.lorenzo@ejemplo.com');
    expect(await store.userByEmail('BEATRIZ.LORENZO@ejemplo.com')).not.toBeNull();

    const log = await store.listActivityLog();
    expect(log[0]?.actionType).toBe('ACCESS_GRANTED');
    expect(log[0]?.initiativeId).toBeNull();
  });

  it('un responsable suma miembros a las áreas que lleva', async () => {
    const { store } = makeTestStore([]);
    const supervisor = makeSession(['HR', 'FINANCE'], 'LEAD');

    const member = await grantAccess(store, supervisor, {
      name: 'Jorge Ibáñez',
      email: 'jorge@ejemplo.com',
      departments: ['FINANCE'],
      role: 'MEMBER',
    });

    expect(member.role).toBe('MEMBER');
    expect(member.departments).toEqual(['FINANCE']);
  });

  it('un responsable no puede crear otro responsable', async () => {
    const { store } = makeTestStore([]);

    await expect(
      grantAccess(store, makeSession(['HR'], 'LEAD'), {
        name: 'Alguien Más',
        email: 'alguien@ejemplo.com',
        departments: ['HR'],
        role: 'LEAD',
      }),
    ).rejects.toThrow(/miembros de las áreas que llevas/i);
  });

  it('un responsable no puede dar de alta en un área que no lleva', async () => {
    const { store } = makeTestStore([]);

    await expect(
      grantAccess(store, makeSession(['HR'], 'LEAD'), {
        name: 'Alguien Más',
        email: 'alguien@ejemplo.com',
        departments: ['HR', 'TECH'],
        role: 'MEMBER',
      }),
    ).rejects.toThrow(/áreas que llevas/i);
  });

  it('quien es miembro no da de alta a nadie', async () => {
    const { store } = makeTestStore([]);

    await expect(
      grantAccess(store, makeSession('TECH', 'MEMBER'), {
        name: 'Alguien Más',
        email: 'alguien@ejemplo.com',
        departments: ['TECH'],
        role: 'MEMBER',
      }),
    ).rejects.toThrow(/no puede dar acceso/i);
  });

  it('exige al menos un área y un correo con formato válido', async () => {
    const { store } = makeTestStore([]);
    const director = makeSession('PRODUCT', 'EXECUTIVE');

    await expect(
      grantAccess(store, director, {
        name: 'Sin Áreas',
        email: 'sinareas@ejemplo.com',
        departments: [],
        role: 'MEMBER',
      }),
    ).rejects.toThrow(/al menos un área/i);

    await expect(
      grantAccess(store, director, {
        name: 'Correo Roto',
        email: 'esto-no-es-un-correo',
        departments: ['TECH'],
        role: 'MEMBER',
      }),
    ).rejects.toThrow(/correo/i);
  });

  it('reactiva a quien vuelve en lugar de duplicarlo', async () => {
    const existing = makeUser({ email: 'vuelve@ejemplo.com', isActive: false, departments: ['QA'] });
    const { store } = makeTestStore([], [existing]);

    const user = await grantAccess(store, makeSession('PRODUCT', 'EXECUTIVE'), {
      name: existing.name,
      email: 'vuelve@ejemplo.com',
      departments: ['TECH', 'CYBER'],
      role: 'LEAD',
    });

    expect(user.id).toBe(existing.id);
    expect(user.isActive).toBe(true);
    expect(user.departments).toEqual(['TECH', 'CYBER']);
    expect(await store.listUsers()).toHaveLength(1);
  });
});

describe('edición y baja de personas', () => {
  it('un responsable edita a los miembros de sus áreas', async () => {
    const member = makeUser({ departments: ['FINANCE'], role: 'MEMBER' });
    const { store } = makeTestStore([], [member]);

    const updated = await updateAccess(store, makeSession(['HR', 'FINANCE'], 'LEAD'), {
      userId: member.id,
      departments: ['HR'],
    });

    expect(updated.departments).toEqual(['HR']);
  });

  it('un responsable no puede ascender a nadie', async () => {
    const member = makeUser({ departments: ['HR'], role: 'MEMBER' });
    const { store } = makeTestStore([], [member]);

    await expect(
      updateAccess(store, makeSession(['HR'], 'LEAD'), { userId: member.id, role: 'LEAD' }),
    ).rejects.toThrow(/no puedes otorgar/i);
  });

  it('un responsable no alcanza a quien tiene áreas fuera de las suyas', async () => {
    const shared = makeUser({ departments: ['HR', 'TECH'], role: 'MEMBER' });
    const { store } = makeTestStore([], [shared]);

    await expect(
      updateAccess(store, makeSession(['HR'], 'LEAD'), { userId: shared.id, departments: ['HR'] }),
    ).rejects.toThrow(/fuera de tu alcance/i);
  });

  it('un responsable no toca a otro responsable', async () => {
    const other = makeUser({ departments: ['HR'], role: 'LEAD' });
    const { store } = makeTestStore([], [other]);

    await expect(
      setAccessActive(store, makeSession(['HR'], 'LEAD'), { userId: other.id, isActive: false }),
    ).rejects.toThrow(/fuera de tu alcance/i);
  });

  it('revocar el acceso deja el perfil inactivo y auditado', async () => {
    const collaborator = makeUser({ departments: ['DESIGN'] });
    const director = makeUser({ departments: ['PRODUCT'], role: 'EXECUTIVE' });
    const { store } = makeTestStore([], [collaborator, director]);

    const updated = await setAccessActive(store, sessionOf(director), {
      userId: collaborator.id,
      isActive: false,
    });

    expect(updated.isActive).toBe(false);
    const log = await store.listActivityLog();
    expect(log.some((entry) => entry.actionType === 'ACCESS_REVOKED')).toBe(true);
  });

  it('nadie puede revocarse el acceso ni cambiarse el rol a sí mismo', async () => {
    const director = makeUser({ departments: ['PRODUCT'], role: 'EXECUTIVE' });
    const { store } = makeTestStore([], [director]);

    await expect(
      setAccessActive(store, sessionOf(director), { userId: director.id, isActive: false }),
    ).rejects.toThrow(/tu propio acceso/i);

    await expect(
      updateAccess(store, sessionOf(director), { userId: director.id, role: 'MEMBER' }),
    ).rejects.toThrow(/a ti mismo/i);
  });
});

describe('anonimización (RGPD)', () => {
  it('solo Dirección, y solo sobre quien ya está de baja', async () => {
    const member = makeUser({ departments: ['HR'], isActive: true });
    const { store } = makeTestStore([], [member]);
    const director = makeSession('PRODUCT', 'EXECUTIVE');

    await expect(
      anonymizeUser(store, makeSession(['HR'], 'LEAD'), { userId: member.id, reason: 'Petición de supresión' }),
    ).rejects.toThrow(/Dirección/i);

    await expect(
      anonymizeUser(store, director, { userId: member.id, reason: 'Petición formal de supresión' }),
    ).rejects.toThrow(/Revoca primero el acceso/i);
  });

  it('sustituye nombre y correo, conserva la fila y no filtra el correo al log', async () => {
    const member = makeUser({ name: 'Persona Real', email: 'persona.real@ejemplo.com', isActive: false });
    const { store } = makeTestStore([], [member]);
    const director = makeSession('PRODUCT', 'EXECUTIVE');

    const anonymized = await anonymizeUser(store, director, {
      userId: member.id,
      reason: 'Ejercicio del derecho de supresión registrado por el DPO.',
    });

    expect(anonymized.isAnonymized).toBe(true);
    expect(anonymized.isActive).toBe(false);
    expect(anonymized.name).not.toContain('Persona Real');
    expect(anonymized.email).not.toContain('persona.real');
    // La fila sigue existiendo: los eventos que firmó conservan su sujeto.
    expect(await store.userById(member.id)).not.toBeNull();

    const log = await store.listActivityLog();
    const entry = log.find((item) => item.actionType === 'ACCESS_ANONYMIZED');
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry)).not.toContain('persona.real@ejemplo.com');
  });

  it('un perfil anonimizado no se reactiva ni se reutiliza', async () => {
    const member = makeUser({ isActive: false });
    const { store } = makeTestStore([], [member]);
    const director = makeSession('PRODUCT', 'EXECUTIVE');
    await anonymizeUser(store, director, { userId: member.id, reason: 'Supresión solicitada por la persona.' });

    await expect(
      setAccessActive(store, director, { userId: member.id, isActive: true }),
    ).rejects.toThrow(/no puede reactivarse/i);
  });
});

describe('cuenta propia', () => {
  it('cualquier rol puede corregir su nombre visible y queda auditado', async () => {
    const member = makeUser({ name: 'Nombre Antiguo', departments: ['MARKETING'], role: 'MEMBER' });
    const { store } = makeTestStore([], [member]);

    const updated = await updateOwnProfile(store, sessionOf(member), { name: 'Nombre Corregido' });

    expect(updated.name).toBe('Nombre Corregido');
    const log = await store.listActivityLog();
    expect(log.some((entry) => entry.actionType === 'PROFILE_UPDATED')).toBe(true);
  });

  it('el nombre propio tiene un mínimo', async () => {
    const member = makeUser({ role: 'MEMBER' });
    const { store } = makeTestStore([], [member]);

    await expect(updateOwnProfile(store, sessionOf(member), { name: 'Al' })).rejects.toThrow(/3 caracteres/i);
  });
});
