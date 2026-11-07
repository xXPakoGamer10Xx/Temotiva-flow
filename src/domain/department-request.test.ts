import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION_TYPES, HELP_TYPES_V1 } from './enums';
import {
  ACTION_TYPE_LABELS,
  DEPARTMENT_REQUEST_STATUS_LABELS,
  INITIATIVE_DEPENDENCY_BADGE,
  REQUEST_BLOCKING_LABEL_LINKED,
  REQUEST_BLOCKING_LABEL_STANDALONE,
} from './labels';
import {
  MAX_DEPARTMENT_REQUEST_TITLE,
  MIN_DEPARTMENT_REQUEST_DESCRIPTION,
  MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES,
  MIN_DEPARTMENT_REQUEST_TITLE,
} from './rules';
import { DEPARTMENT_REQUEST_HELP_TYPES, DEPARTMENT_REQUEST_STATUSES } from './department-request';

/** Contrato de dominio del módulo de Dependencias (spec 001, T-01). */
describe('contrato de dominio de peticiones entre áreas', () => {
  it('tiene exactamente los tres estados del ciclo de vida, en orden', () => {
    expect(DEPARTMENT_REQUEST_STATUSES).toEqual(['PENDING', 'IN_PROGRESS', 'RESOLVED']);
  });

  it('rotula cada estado en español', () => {
    expect(DEPARTMENT_REQUEST_STATUS_LABELS).toEqual({
      PENDING: 'Pendiente',
      IN_PROGRESS: 'En curso',
      RESOLVED: 'Resuelta',
    });
  });

  it('limita el tipo de necesidad al conjunto vigente HELP_TYPES_V1', () => {
    expect(DEPARTMENT_REQUEST_HELP_TYPES).toEqual(HELP_TYPES_V1);
  });

  it('registra los tres eventos de auditoría con etiqueta propia', () => {
    for (const event of [
      'DEPARTMENT_REQUEST_CREATED',
      'DEPARTMENT_REQUEST_STARTED',
      'DEPARTMENT_REQUEST_RESOLVED',
    ] as const) {
      expect(ACTION_TYPES).toContain(event);
      expect(ACTION_TYPE_LABELS[event].length, event).toBeGreaterThan(5);
    }
  });

  it('fija los umbrales de la spec', () => {
    expect(MIN_DEPARTMENT_REQUEST_TITLE).toBe(8);
    expect(MAX_DEPARTMENT_REQUEST_TITLE).toBe(120);
    expect(MIN_DEPARTMENT_REQUEST_DESCRIPTION).toBe(15);
    expect(MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES).toBe(5);
  });

  it('ningún rótulo de bloqueo informativo promete detener el SLE', () => {
    expect(REQUEST_BLOCKING_LABEL_STANDALONE).toBe('Prioridad Alta (No altera SLE)');
    expect(REQUEST_BLOCKING_LABEL_LINKED).toBe('Bloquea iniciativa (No altera SLE)');
    expect(INITIATIVE_DEPENDENCY_BADGE).toBe('Iniciativa (SLE Activo)');
  });
});

describe('migración db/06-department-requests.sql', () => {
  const sql = readFileSync(join(process.cwd(), 'db', '06-department-requests.sql'), 'utf8');

  it('es idempotente', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS department_requests/);
    const indexes = sql.match(/CREATE INDEX/g) ?? [];
    const idempotent = sql.match(/CREATE INDEX IF NOT EXISTS/g) ?? [];
    expect(indexes.length).toBeGreaterThan(0);
    expect(idempotent.length).toBe(indexes.length);
    expect(sql).not.toMatch(/CREATE TYPE/);
  });

  it('reutiliza help_type_enum y restringe el estado', () => {
    expect(sql).toMatch(/help_type\s+help_type_enum\s+NOT NULL/);
    expect(sql).toMatch(/CHECK \(status IN \('PENDING', 'IN_PROGRESS', 'RESOLVED'\)\)/);
  });

  it('impide pedirse ayuda a la propia área y exige documentar la resolución', () => {
    expect(sql).toMatch(/CHECK \(source_department <> target_department\)/);
    expect(sql).toMatch(/department_request_resolution_documented/);
  });

  it('no altera tablas existentes', () => {
    expect(sql).not.toMatch(/ALTER TABLE/i);
    expect(sql).not.toMatch(/DROP /i);
  });

  it('se aplica desde setup-db después de la 05', () => {
    const setup = readFileSync(join(process.cwd(), 'scripts', 'setup-db.ts'), 'utf8');
    const at05 = setup.indexOf("'05-api-tokens.sql'");
    const at06 = setup.indexOf("'06-department-requests.sql'");
    expect(at05).toBeGreaterThan(-1);
    expect(at06).toBeGreaterThan(at05);
  });
});
