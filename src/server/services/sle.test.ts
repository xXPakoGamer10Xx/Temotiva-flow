import { describe, expect, it } from 'vitest';
import { SEED_STAGES, STAGE_ID_BY_KEY } from '@/domain/workflow';
import { computeSle, formatDuration } from './sle';
import { HOUR, TEST_NOW, hoursBefore, makeInitiative } from './test-utils';

/**
 * Invariante 4 (AGENTS.md §5.4) y decisión D4: el SLE es neto. El tiempo que la
 * iniciativa pasa en parada no cuenta contra su objetivo.
 */
const FEASIBILITY = SEED_STAGES.find((stage) => stage.id === STAGE_ID_BY_KEY.FEASIBILITY)!;

describe('reloj de SLE neto', () => {
  it('descuenta el tiempo en parada ya consolidado', async () => {
    const initiative = makeInitiative({
      stageEnteredAt: hoursBefore(40),
      blockedMsInStage: 16 * HOUR,
    });

    const reading = computeSle(initiative, FEASIBILITY, TEST_NOW);

    expect(reading.elapsedMs).toBe(40 * HOUR);
    expect(reading.blockedMs).toBe(16 * HOUR);
    expect(reading.netMs).toBe(24 * HOUR);
    expect(reading.state).toBe('ON_TIME');
  });

  it('descuenta también la parada que sigue abierta', () => {
    const initiative = makeInitiative({
      stageEnteredAt: hoursBefore(40),
      isBlocked: true,
      blockedSince: hoursBefore(10),
      blockedMsInStage: 6 * HOUR,
    });

    const reading = computeSle(initiative, FEASIBILITY, TEST_NOW);

    expect(reading.blockedMs).toBe(16 * HOUR);
    expect(reading.netMs).toBe(24 * HOUR);
  });

  it('marca riesgo a partir del 75 % del objetivo', () => {
    const initiative = makeInitiative({ stageEnteredAt: hoursBefore(36) });
    expect(computeSle(initiative, FEASIBILITY, TEST_NOW).state).toBe('AT_RISK');
  });

  it('marca objetivo excedido y cuánto', () => {
    const initiative = makeInitiative({ stageEnteredAt: hoursBefore(56) });
    const reading = computeSle(initiative, FEASIBILITY, TEST_NOW);

    expect(reading.state).toBe('EXCEEDED');
    expect(reading.overdueMs).toBe(8 * HOUR);
  });

  it('una iniciativa parada desde el principio no consume SLE', () => {
    const initiative = makeInitiative({
      stageEnteredAt: hoursBefore(80),
      isBlocked: true,
      blockedSince: hoursBefore(80),
    });

    const reading = computeSle(initiative, FEASIBILITY, TEST_NOW);
    expect(reading.netMs).toBe(0);
    expect(reading.state).toBe('ON_TIME');
  });

  it('formatea duraciones de forma sobria', () => {
    expect(formatDuration(30 * 60 * 1000)).toBe('30 min');
    expect(formatDuration(12 * HOUR)).toBe('12 h');
    expect(formatDuration(52 * HOUR)).toBe('2 d 4 h');
    expect(formatDuration(48 * HOUR)).toBe('2 d');
  });
});
