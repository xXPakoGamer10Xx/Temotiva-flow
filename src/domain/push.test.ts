import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUSH_EVENT_KINDS, type PushMessage, type PushSubscriptionRecord, type SleRiskNotice } from './push';
import type { SeedData } from './seed';

/** Contrato de dominio de la PWA y las notificaciones push (spec 002, T-01). */
describe('contrato de dominio de notificaciones push', () => {
  it('tiene exactamente un tipo de aviso por evento E1–E11 de la spec, en orden', () => {
    expect(PUSH_EVENT_KINDS).toEqual([
      'TASK_ASSIGNED', // E1
      'INITIATIVE_ASSIGNED', // E2
      'DEPENDENCY_INCOMING', // E3
      'REQUEST_INCOMING', // E4
      'DEPENDENCY_RESOLVED', // E5
      'REQUEST_RESOLVED', // E6
      'ENTERED_BOARD', // E7
      'INITIATIVE_CREATED', // E8
      'OVERRIDE', // E9
      'BLOCKED', // E10
      'SLE_AT_RISK', // E11
    ]);
  });

  it('una suscripción guarda solo lo necesario para enviar y la baja lógica', () => {
    const sub: PushSubscriptionRecord = {
      id: '00000000-0000-4000-8000-000000000001',
      userId: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0101',
      endpoint: 'https://push.example/abc',
      p256dh: 'key',
      auth: 'secret',
      userAgent: null,
      createdAt: '2026-11-08T10:00:00.000Z',
      lastUsedAt: null,
      revokedAt: null,
    };
    expect(Object.keys(sub).sort()).toEqual(
      ['auth', 'createdAt', 'endpoint', 'id', 'lastUsedAt', 'p256dh', 'revokedAt', 'userAgent', 'userId'].sort(),
    );
  });

  it('un mensaje push no tiene campos para títulos, descripciones ni nombres', () => {
    const message: PushMessage = {
      kind: 'BLOCKED',
      title: '⛔ TEMO-012 está parada',
      body: 'Desarrollo',
      url: '/board?iniciativa=TEMO-012',
      tag: 'BLOCKED:TEMO-012',
    };
    expect(Object.keys(message).sort()).toEqual(['body', 'kind', 'tag', 'title', 'url']);
  });

  it('la marca de SLE identifica iniciativa y fase', () => {
    const notice: SleRiskNotice = { initiativeId: 'TEMO-012', stageId: 5, notifiedAt: '2026-11-08T10:00:00.000Z' };
    expect(notice.stageId).toBe(5);
  });

  it('las semillas y snapshots antiguos siguen siendo válidos sin las colecciones nuevas', () => {
    const legacy: Pick<SeedData, 'pushSubscriptions' | 'sleRiskNotices'> = {};
    expect(legacy.pushSubscriptions ?? []).toEqual([]);
    expect(legacy.sleRiskNotices ?? []).toEqual([]);
  });
});

describe('migración db/08-push-subscriptions.sql', () => {
  const sql = readFileSync(join(process.cwd(), 'db', '08-push-subscriptions.sql'), 'utf8');

  it('crea las dos tablas nuevas de forma idempotente', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS push_subscriptions/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS sle_risk_notices/);
    const indexes = sql.match(/CREATE INDEX/g) ?? [];
    const idempotent = sql.match(/CREATE INDEX IF NOT EXISTS/g) ?? [];
    expect(indexes.length).toBeGreaterThan(0);
    expect(idempotent.length).toBe(indexes.length);
  });

  it('no altera tablas ni tipos existentes', () => {
    expect(sql).not.toMatch(/ALTER TABLE/i);
    expect(sql).not.toMatch(/DROP /i);
    expect(sql).not.toMatch(/CREATE TYPE/i);
  });

  it('un dispositivo es único por endpoint y la baja es lógica', () => {
    expect(sql).toMatch(/endpoint\s+TEXT\s+UNIQUE\s+NOT NULL/);
    expect(sql).toMatch(/revoked_at\s+TIMESTAMPTZ/);
    expect(sql).toMatch(/WHERE revoked_at IS NULL/);
  });

  it('la marca de SLE es única por iniciativa y fase, con los tipos del DDL', () => {
    expect(sql).toMatch(/initiative_id\s+VARCHAR\(20\)\s+REFERENCES initiatives\(id\)/);
    expect(sql).toMatch(/stage_id\s+INT\s+REFERENCES workflow_stages\(id\)/);
    expect(sql).toMatch(/PRIMARY KEY \(initiative_id, stage_id\)/);
  });

  it('se aplica en db:setup después de la 07', () => {
    const setup = readFileSync(join(process.cwd(), 'scripts', 'setup-db.ts'), 'utf8');
    const at07 = setup.indexOf('07-department-request-attachments.sql');
    const at08 = setup.indexOf('08-push-subscriptions.sql');
    expect(at07).toBeGreaterThan(-1);
    expect(at08).toBeGreaterThan(at07);
  });
});
