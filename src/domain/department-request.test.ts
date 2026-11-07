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
import {
  ATTACHMENT_KINDS,
  ATTACHMENT_SIDES,
  DEPARTMENT_REQUEST_HELP_TYPES,
  DEPARTMENT_REQUEST_STATUSES,
} from './department-request';
import {
  MAX_REQUEST_FILES_PER_SIDE,
  MAX_REQUEST_FILE_BYTES,
  MAX_REQUEST_LINKS_PER_SIDE,
  MAX_REQUEST_LINK_LABEL,
  MAX_REQUEST_LINK_URL,
  MIN_REQUEST_LINK_LABEL,
} from './rules';

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

/** Ampliación A — adjuntos y enlaces (spec 001 §13, T-11). */
describe('contrato de adjuntos de peticiones', () => {
  it('distingue el lado (petición o respuesta) y la clase (archivo o enlace)', () => {
    expect(ATTACHMENT_SIDES).toEqual(['REQUEST', 'RESPONSE']);
    expect(ATTACHMENT_KINDS).toEqual(['FILE', 'LINK']);
  });

  it('fija los cupos y límites de la spec', () => {
    expect(MAX_REQUEST_FILES_PER_SIDE).toBe(5);
    expect(MAX_REQUEST_LINKS_PER_SIDE).toBe(5);
    expect(MAX_REQUEST_FILE_BYTES).toBe(4 * 1024 * 1024);
    expect(MIN_REQUEST_LINK_LABEL).toBe(2);
    expect(MAX_REQUEST_LINK_LABEL).toBe(60);
    expect(MAX_REQUEST_LINK_URL).toBe(500);
  });

  it('registra el evento de adjunto con etiqueta propia', () => {
    expect(ACTION_TYPES).toContain('DEPARTMENT_REQUEST_ATTACHMENT_ADDED');
    expect(ACTION_TYPE_LABELS.DEPARTMENT_REQUEST_ATTACHMENT_ADDED.length).toBeGreaterThan(5);
  });
});

describe('migración db/07-department-request-attachments.sql', () => {
  const sql = readFileSync(join(process.cwd(), 'db', '07-department-request-attachments.sql'), 'utf8');

  it('es idempotente y no altera tablas existentes', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS department_request_attachments/);
    const indexes = sql.match(/CREATE INDEX/g) ?? [];
    expect(indexes.length).toBeGreaterThan(0);
    expect((sql.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length).toBe(indexes.length);
    expect(sql).not.toMatch(/ALTER TABLE|DROP |CREATE TYPE/i);
  });

  it('cuelga de department_requests y restringe lado y clase', () => {
    expect(sql).toMatch(/request_id UUID REFERENCES department_requests\(id\) NOT NULL/);
    expect(sql).toMatch(/CHECK \(side IN \('REQUEST', 'RESPONSE'\)\)/);
    expect(sql).toMatch(/CHECK \(kind IN \('FILE', 'LINK'\)\)/);
  });

  it('exige archivos completos y enlaces https', () => {
    expect(sql).toMatch(/dra_file_complete/);
    expect(sql).toMatch(/dra_link_complete/);
    expect(sql).toMatch(/url LIKE 'https:\/\/%'/);
  });

  it('se aplica desde setup-db después de la 06', () => {
    const setup = readFileSync(join(process.cwd(), 'scripts', 'setup-db.ts'), 'utf8');
    const at06 = setup.indexOf("'06-department-requests.sql'");
    const at07 = setup.indexOf("'07-department-request-attachments.sql'");
    expect(at06).toBeGreaterThan(-1);
    expect(at07).toBeGreaterThan(at06);
  });
});
