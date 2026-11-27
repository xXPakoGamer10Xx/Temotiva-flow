import { z } from 'zod';
import { DEPARTMENTS, TSHIRT_SIZES } from '@/domain/enums';
import {
  MAX_CUSTOM_CHECK_LABEL,
  MAX_CUSTOM_CHECK_NOTE,
  MAX_INITIATIVE_DESCRIPTION,
  MAX_SIGNOFF_NOTE,
  MAX_STAGE_ADVANCE_NOTE,
  MIN_CUSTOM_CHECK_LABEL,
  MIN_INITIATIVE_DESCRIPTION,
  MIN_STAGE_ADVANCE_NOTE,
} from '@/domain/rules';
import { normalizeSignoffNote, validateSignoffPayload } from '@/domain/signoffs';

/**
 * Esquemas de entrada de la spec 005 (constitución §4). Viven fuera de los
 * archivos `'use server'` para poder probarlos sin sesión ni Next.
 *
 * Quien aprueba o marca nunca viaja en la entrada: sale de la sesión.
 */

/** Igual que `initiativeIdSchema` de `shared.ts`, que no se puede importar aquí (`server-only`). */
const initiativeId = z.string().regex(/^TEMO-\d+$/, 'Identificador de iniciativa no válido.');

/** Descripción obligatoria al crear (RF-1). Mismos límites que el servicio. */
export const initiativeDescriptionSchema = z
  .string({ error: 'La descripción es obligatoria.' })
  .trim()
  .min(MIN_INITIATIVE_DESCRIPTION, `Describe la iniciativa (mínimo ${MIN_INITIATIVE_DESCRIPTION} caracteres).`)
  .max(MAX_INITIATIVE_DESCRIPTION, `La descripción admite como máximo ${MAX_INITIATIVE_DESCRIPTION} caracteres.`);

/** Nota de avance obligatoria (RF-3). Mismos límites que el CHECK de `initiative_stage_notes`. */
export const advanceNoteSchema = z
  .string({ error: 'La nota de avance es obligatoria.' })
  .trim()
  .min(MIN_STAGE_ADVANCE_NOTE, `Explica qué se hizo o cerró en esta fase (mínimo ${MIN_STAGE_ADVANCE_NOTE} caracteres).`)
  .max(MAX_STAGE_ADVANCE_NOTE, `La nota admite como máximo ${MAX_STAGE_ADVANCE_NOTE} caracteres.`);

/**
 * Aprobar o retirar la casilla de un área. El requisito exacto (nota o talla)
 * depende de la fase, que solo conoce el servidor: aquí se valida la forma y
 * las reglas que no dependen de la fase; el servicio aplica la de la fase con
 * la misma función `validateSignoffPayload`.
 */
export const setStageSignoffSchema = z
  .object({
    initiativeId,
    stageId: z.number().int().positive(),
    department: z.enum(DEPARTMENTS),
    approved: z.boolean(),
    note: z.string().max(MAX_SIGNOFF_NOTE + 200).nullable().optional(),
    noObservations: z.boolean().optional(),
    tshirtSize: z.enum(TSHIRT_SIZES, { error: 'La talla debe ser XS, S, M, L o XL.' }).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (!value.approved) return;
    const problem = validateSignoffPayload('NONE', {
      note: normalizeSignoffNote(value.note),
      noObservations: value.noObservations,
      tshirtSize: value.tshirtSize ?? null,
    });
    if (problem) context.addIssue({ code: 'custom', message: problem, path: ['note'] });
  });

export const addCustomCheckSchema = z.object({
  initiativeId,
  label: z
    .string()
    .trim()
    .min(MIN_CUSTOM_CHECK_LABEL, `La casilla necesita un enunciado de al menos ${MIN_CUSTOM_CHECK_LABEL} caracteres.`)
    .max(MAX_CUSTOM_CHECK_LABEL, `El enunciado admite como máximo ${MAX_CUSTOM_CHECK_LABEL} caracteres.`),
  note: z
    .string()
    .trim()
    .max(MAX_CUSTOM_CHECK_NOTE, `La nota admite como máximo ${MAX_CUSTOM_CHECK_NOTE} caracteres.`)
    .nullable()
    .optional(),
});

export const setCustomCheckStateSchema = z.object({
  checkId: z.string().uuid('Casilla no válida.'),
  isCompleted: z.boolean(),
});

export const removeCustomCheckSchema = z.object({
  checkId: z.string().uuid('Casilla no válida.'),
});
