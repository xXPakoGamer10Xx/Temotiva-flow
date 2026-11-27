import type { Department, StageKey, TshirtSize } from './enums';
import { TSHIRT_SIZES } from './enums';
import { MAX_SIGNOFF_NOTE, MIN_SIGNOFF_NOTE } from './rules';
import type { StageSignoff } from './types';

/**
 * Aprobaciones obligatorias por área (spec 005 §5.2).
 *
 * Cada fase exige una aprobación explícita de cada área participante
 * («APROBADO AL 100% POR: …»). Es una regla de gobierno fija: vive aquí, sin
 * dependencias de servidor, para que servicio, Zod e interfaz lean la misma.
 *
 * "Desarrollo" es `TECH` y "Calidad" es `QA` (decisión P-2).
 */

export type SignoffRequirementKind = 'NONE' | 'NOTE_OR_NO_OBSERVATIONS' | 'TSHIRT';

export interface SignoffRequirement {
  department: Department;
  requirement: SignoffRequirementKind;
}

export const STAGE_SIGNOFF_MATRIX: Record<StageKey, readonly SignoffRequirement[]> = {
  IDEATION: [
    { department: 'PSYCHOLOGY', requirement: 'NONE' },
    { department: 'PRODUCT', requirement: 'NONE' },
  ],
  FEASIBILITY: [
    { department: 'LEGAL', requirement: 'NOTE_OR_NO_OBSERVATIONS' },
    { department: 'CYBER', requirement: 'NOTE_OR_NO_OBSERVATIONS' },
    { department: 'TECH', requirement: 'TSHIRT' },
  ],
  CO_DESIGN: [{ department: 'DESIGN', requirement: 'NONE' }],
  READY: [
    { department: 'LEGAL', requirement: 'NONE' },
    { department: 'PRODUCT', requirement: 'NONE' },
    { department: 'PSYCHOLOGY', requirement: 'NONE' },
  ],
  DEV: [{ department: 'TECH', requirement: 'NONE' }],
  QA: [
    { department: 'CYBER', requirement: 'NONE' },
    { department: 'QA', requirement: 'NONE' },
  ],
  PROD: [{ department: 'TECH', requirement: 'NONE' }],
};

const SIGNOFF_ID_PREFIX = 'SIGNOFF:';

/**
 * Identificador estable de una aprobación pendiente (`SIGNOFF:FEASIBILITY:LEGAL`).
 * Es el que viaja en el panel de pendientes y en el reconocimiento del override.
 */
export function signoffId(stageKey: StageKey, department: Department): string {
  return `${SIGNOFF_ID_PREFIX}${stageKey}:${department}`;
}

export function isSignoffId(id: string): boolean {
  return id.startsWith(SIGNOFF_ID_PREFIX);
}

export function signoffsFor(stageKey: StageKey): readonly SignoffRequirement[] {
  return STAGE_SIGNOFF_MATRIX[stageKey];
}

/** Requisito del área en la fase, o `null` si esa área no aprueba la fase. */
export function requirementFor(stageKey: StageKey, department: Department): SignoffRequirementKind | null {
  return STAGE_SIGNOFF_MATRIX[stageKey].find((entry) => entry.department === department)?.requirement ?? null;
}

/** Lo que llega para aprobar: la nota, «Sin observaciones» y la talla. */
export interface SignoffPayload {
  note?: string | null;
  noObservations?: boolean;
  tshirtSize?: TshirtSize | null;
}

/** Normaliza el texto libre: recorta y convierte el vacío en `null`. */
export function normalizeSignoffNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Valida lo que acompaña a una aprobación. Devuelve el mensaje en español o
 * `null` si es válido. Misma regla que los CHECK de
 * `initiative_stage_signoffs` y que el esquema Zod.
 */
export function validateSignoffPayload(requirement: SignoffRequirementKind, payload: SignoffPayload): string | null {
  const note = normalizeSignoffNote(payload.note);
  const noObservations = payload.noObservations === true;

  if (note !== null && (note.length < MIN_SIGNOFF_NOTE || note.length > MAX_SIGNOFF_NOTE)) {
    return `La nota debe tener entre ${MIN_SIGNOFF_NOTE} y ${MAX_SIGNOFF_NOTE} caracteres.`;
  }
  if (note !== null && noObservations) {
    return 'Elige entre dejar una nota o marcar «Sin observaciones», no las dos.';
  }
  if (payload.tshirtSize != null && !TSHIRT_SIZES.includes(payload.tshirtSize)) {
    return 'La talla debe ser XS, S, M, L o XL.';
  }

  if (requirement === 'NOTE_OR_NO_OBSERVATIONS' && note === null && !noObservations) {
    return 'Deja tus consideraciones o marca «Sin observaciones» antes de aprobar.';
  }
  if (requirement === 'TSHIRT' && payload.tshirtSize == null) {
    return 'Elige la talla de esfuerzo (T-shirt) antes de aprobar.';
  }
  return null;
}

/** ¿Esta fila cumple la aprobación exigida? (aprobada y con su requisito extra) */
export function isSignoffSatisfied(
  requirement: SignoffRequirementKind,
  signoff: Pick<StageSignoff, 'isApproved' | 'note' | 'noObservations' | 'tshirtSize'> | undefined,
): boolean {
  if (!signoff?.isApproved) return false;
  return validateSignoffPayload(requirement, signoff) === null;
}
