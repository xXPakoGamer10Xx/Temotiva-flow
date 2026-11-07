import { z } from 'zod';
import { DEPARTMENTS } from '@/domain/enums';
import { DEPARTMENT_REQUEST_HELP_TYPES } from '@/domain/department-request';
import {
  MAX_DEPARTMENT_REQUEST_TITLE,
  MIN_DEPARTMENT_REQUEST_DESCRIPTION,
  MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES,
  MIN_DEPARTMENT_REQUEST_TITLE,
} from '@/domain/rules';

/**
 * Esquemas de entrada de las Server Actions del buzón (spec 001, constitución §4).
 *
 * Viven fuera del archivo `'use server'` (que solo puede exportar funciones
 * asíncronas) para poder probarlos sin sesión ni Next. Son la frontera de
 * entrada: el autor, el estado y las fechas nunca se aceptan del cliente; los
 * campos no declarados se descartan. Las reglas de negocio (origen propio,
 * destino distinto, iniciativa viva) se comprueban en el servicio.
 */

const TITLE_MESSAGE = `El título debe tener entre ${MIN_DEPARTMENT_REQUEST_TITLE} y ${MAX_DEPARTMENT_REQUEST_TITLE} caracteres.`;
const DESCRIPTION_MESSAGE = `Describe la petición con al menos ${MIN_DEPARTMENT_REQUEST_DESCRIPTION} caracteres.`;
const NOTES_MESSAGE = `Escribe una respuesta de al menos ${MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES} caracteres.`;
const REQUEST_ID_MESSAGE = 'Identificador de petición no válido.';

const requestIdSchema = z.string({ message: REQUEST_ID_MESSAGE }).uuid({ message: REQUEST_ID_MESSAGE });

export const createDepartmentRequestSchema = z.object({
  sourceDepartment: z.enum(DEPARTMENTS, { message: 'Elige desde qué área pides ayuda.' }),
  targetDepartment: z.enum(DEPARTMENTS, { message: 'Elige a qué área pides ayuda.' }),
  helpType: z.enum(DEPARTMENT_REQUEST_HELP_TYPES, { message: 'Elige qué tipo de ayuda necesitas.' }),
  title: z
    .string({ message: TITLE_MESSAGE })
    .trim()
    .min(MIN_DEPARTMENT_REQUEST_TITLE, TITLE_MESSAGE)
    .max(MAX_DEPARTMENT_REQUEST_TITLE, TITLE_MESSAGE),
  description: z.string({ message: DESCRIPTION_MESSAGE }).trim().min(MIN_DEPARTMENT_REQUEST_DESCRIPTION, DESCRIPTION_MESSAGE),
  blocksInitiative: z.boolean({ message: 'Indica si la petición bloquea una iniciativa.' }).default(false),
  initiativeId: z
    .string({ message: 'Identificador de iniciativa no válido.' })
    .regex(/^TEMO-\d+$/, 'Identificador de iniciativa no válido.')
    .nullish(),
});

export const startDepartmentRequestSchema = z.object({
  requestId: requestIdSchema,
});

export const resolveDepartmentRequestSchema = z.object({
  requestId: requestIdSchema,
  resolutionNotes: z.string({ message: NOTES_MESSAGE }).trim().min(MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES, NOTES_MESSAGE),
});
