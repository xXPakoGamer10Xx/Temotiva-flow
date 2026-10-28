import { describe, expect, it } from 'vitest';
import { addAreaLink, getAreaLinksView, normalizeLinkUrl, removeAreaLink } from './area-links';
import { TEST_NOW, makeTestStore, makeUser, sessionOf } from './test-utils';

const DOC = 'https://docs.google.com/document/d/abc123/edit';

function setup() {
  const cyberMember = makeUser({ departments: ['CYBER'], role: 'MEMBER' });
  const cyberOther = makeUser({ departments: ['CYBER'], role: 'MEMBER' });
  const cyberLead = makeUser({ departments: ['CYBER'], role: 'LEAD' });
  const legalMember = makeUser({ departments: ['LEGAL'], role: 'MEMBER' });
  const boss = makeUser({ departments: ['PRODUCT'], role: 'EXECUTIVE' });
  const ctx = makeTestStore([], [cyberMember, cyberOther, cyberLead, legalMember, boss]);
  return { ...ctx, cyberMember, cyberOther, cyberLead, legalMember, boss };
}

const add = (s: ReturnType<typeof setup>, user: ReturnType<typeof makeUser>, url = DOC) =>
  addAreaLink(s.store, sessionOf(user), { title: 'Política de acceso', url, now: TEST_NOW });

describe('enlaces de documentos por área', () => {
  it('solo acepta https a hosts de Google', () => {
    expect(normalizeLinkUrl(DOC)).toBe(DOC);
    for (const bad of ['javascript:alert(1)', 'http://docs.google.com/x', 'https://evil.com/doc', 'no es url', 'https://user:pw@docs.google.com/x']) {
      expect(() => normalizeLinkUrl(bad)).toThrow();
    }
  });

  it('cualquier miembro añade a su área y lo ve su equipo y Dirección, no otra área', async () => {
    const s = setup();
    const link = await add(s, s.cyberMember);
    expect(link.department).toBe('CYBER');
    const ids = async (u: typeof s.cyberMember) => (await getAreaLinksView(s.store, sessionOf(u))).map((l) => l.id);
    expect(await ids(s.cyberOther)).toEqual([link.id]);
    expect(await ids(s.boss)).toEqual([link.id]);
    expect(await ids(s.legalMember)).toEqual([]);
  });

  it('no deja añadir a un área ajena', async () => {
    const s = setup();
    await expect(
      addAreaLink(s.store, sessionOf(s.legalMember), { title: 'Algo', url: DOC, department: 'CYBER' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('retira quien lo añadió, el LEAD o Dirección; otro miembro no, y queda en la caja negra', async () => {
    const s = setup();
    const link = await add(s, s.cyberMember);
    await expect(removeAreaLink(s.store, sessionOf(s.cyberOther), { linkId: link.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(removeAreaLink(s.store, sessionOf(s.legalMember), { linkId: link.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await removeAreaLink(s.store, sessionOf(s.cyberLead), { linkId: link.id, now: TEST_NOW });
    expect(await getAreaLinksView(s.store, sessionOf(s.cyberMember))).toEqual([]);
    // Baja lógica: la fila sigue.
    expect((await s.store.areaLinkById(link.id))?.isRemoved).toBe(true);
    const log = await s.store.listActivityLog();
    expect(log.map((e) => e.actionType)).toEqual(expect.arrayContaining(['LINK_ADDED', 'LINK_REMOVED']));
  });
});
