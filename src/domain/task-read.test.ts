import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION_TYPES } from './enums';
import { ACTION_TYPE_LABELS } from './labels';
import { TASK_READ_SOURCES, elapsedBetween, formatDuration } from './task-read';

/** Contrato de dominio de la spec 003 (T-01). */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatDuration (RF-13)', () => {
  it.each([
    [0, '< 1 min'],
    [59 * 1000, '< 1 min'],
    [12 * MIN, '12 min'],
    [HOUR, '1 h'],
    [3 * HOUR + 20 * MIN + 59 * 1000, '3 h 20 min'],
    [2 * DAY, '2 d'],
    [2 * DAY + 4 * HOUR + 30 * MIN, '2 d 4 h'],
    [-5 * MIN, '< 1 min'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('elapsedBetween', () => {
  it('mide entre dos instantes y devuelve null si falta alguno', () => {
    expect(elapsedBetween('2026-11-13T10:00:00.000Z', '2026-11-13T10:12:00.000Z')).toBe(12 * MIN);
    expect(elapsedBetween(null, '2026-11-13T10:12:00.000Z')).toBeNull();
    expect(elapsedBetween('2026-11-13T10:00:00.000Z', null)).toBeNull();
  });
});

describe('contrato de la spec 003', () => {
  it('tiene las dos fuentes de lectura', () => {
    expect(TASK_READ_SOURCES).toEqual(['MANUAL', 'AUTO']);
  });

  it('registra TASK_READ con etiqueta propia', () => {
    expect(ACTION_TYPES).toContain('TASK_READ');
    expect(ACTION_TYPE_LABELS.TASK_READ).toBe('Tarea de área leída');
  });

  it('la migración 11 crea la tabla con un único ciclo abierto por tarea y se aplica tras la 10', () => {
    const sql = readFileSync(join(process.cwd(), 'db', '11-dept-task-reads.sql'), 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS dept_task_reads/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS dept_task_reads_open_idx ON dept_task_reads \(task_id\) WHERE closed_at IS NULL/);
    expect(sql).toMatch(/\(read_at IS NULL\) = \(read_source IS NULL\)/);
    const setup = readFileSync(join(process.cwd(), 'scripts', 'setup-db.ts'), 'utf8');
    expect(setup.indexOf("'11-dept-task-reads.sql'")).toBeGreaterThan(setup.indexOf("'10-department-request-target-user.sql'"));
  });
});
