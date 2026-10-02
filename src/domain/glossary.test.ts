import { describe, expect, it } from 'vitest';
import { STAGE_KEYS, USER_ROLES } from './enums';
import { GLOSSARY, GLOSSARY_KEYS, ROLE_GUIDE, STAGE_GUIDE } from './glossary';

describe('glosario de la interfaz', () => {
  it('explica cada término con título, frase corta y explicación completa', () => {
    for (const key of GLOSSARY_KEYS) {
      const term = GLOSSARY[key];
      expect(term.title.length, key).toBeGreaterThan(3);
      expect(term.short.length, key).toBeGreaterThan(20);
      expect(term.long.length, key).toBeGreaterThan(term.short.length);
    }
  });

  it('describe las 7 fases y los 3 roles', () => {
    for (const stage of STAGE_KEYS) expect(STAGE_GUIDE[stage]).toBeTruthy();
    for (const role of USER_ROLES) expect(ROLE_GUIDE[role].can.length).toBeGreaterThan(0);
  });
});
