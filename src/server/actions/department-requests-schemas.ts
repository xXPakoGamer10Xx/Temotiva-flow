import { z } from 'zod';
import { DEPARTMENTS } from '@/domain/enums';
import {
  ATTACHMENT_SIDES,
  DEPARTMENT_REQUEST_HELP_TYPES,
  hasControlChars,
  isStorableHttpsUrl,
} from '@/domain/department-request';
import {
  MAX_DEPARTMENT_REQUEST_TITLE,
  MAX_REQUEST_LINKS_PER_SIDE,
  MAX_REQUEST_LINK_LABEL,
  MAX_REQUEST_LINK_URL,
  MIN_DEPARTMENT_REQUEST_DESCRIPTION,
  MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES,
  MIN_DEPARTMENT_REQUEST_TITLE,
  MIN_REQUEST_LINK_LABEL,
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

// --- Ampliación A: enlaces y lado de los adjuntos --------------------------------

const LINK_LABEL_MESSAGE = `Cada enlace necesita un nombre de entre ${MIN_REQUEST_LINK_LABEL} y ${MAX_REQUEST_LINK_LABEL} caracteres.`;
const LINK_URL_MESSAGE = 'Cada enlace debe ser una dirección https:// válida.';

/** Lo mismo que acepta la tabla (`https://` literal, sin credenciales ni control); el servicio lo vuelve a comprobar. */
const isSafeHttpsUrl = isStorableHttpsUrl;

const linkSchema = z.object(
  {
    label: z
      .string({ message: LINK_LABEL_MESSAGE })
      .trim()
      .min(MIN_REQUEST_LINK_LABEL, LINK_LABEL_MESSAGE)
      .max(MAX_REQUEST_LINK_LABEL, LINK_LABEL_MESSAGE)
      .refine((value) => !hasControlChars(value), LINK_LABEL_MESSAGE),
    url: z
      .string({ message: LINK_URL_MESSAGE })
      .trim()
      .max(MAX_REQUEST_LINK_URL, `La dirección del enlace no puede superar ${MAX_REQUEST_LINK_URL} caracteres.`)
      .refine(isSafeHttpsUrl, LINK_URL_MESSAGE),
  },
  { message: 'Enlace no válido.' },
);

const LINKS_LIMIT_MESSAGE = `Cada parte de la petición admite como máximo ${MAX_REQUEST_LINKS_PER_SIDE} enlaces.`;
const linksSchema = z.array(linkSchema, { message: 'Enlaces no válidos.' }).max(MAX_REQUEST_LINKS_PER_SIDE, LINKS_LIMIT_MESSAGE);

/** Lado de un adjunto; también lo usa la ruta de subida de archivos. */
export const attachmentSideSchema = z.enum(ATTACHMENT_SIDES, {
  message: 'Indica si el adjunto es de la petición o de la respuesta.',
});

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
  links: linksSchema.optional(),
});

export const startDepartmentRequestSchema = z.object({
  requestId: requestIdSchema,
});

export const resolveDepartmentRequestSchema = z.object({
  requestId: requestIdSchema,
  resolutionNotes: z.string({ message: NOTES_MESSAGE }).trim().min(MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES, NOTES_MESSAGE),
  links: linksSchema.optional(),
});

const ATTACHMENT_ID_MESSAGE = 'Identificador de adjunto no válido.';

/** Ampliación B: el servidor decide si la sesión puede retirarlo. */
export const removeDepartmentRequestAttachmentSchema = z.object({
  attachmentId: z.string({ message: ATTACHMENT_ID_MESSAGE }).uuid({ message: ATTACHMENT_ID_MESSAGE }),
});

export const addDepartmentRequestLinksSchema = z.object({
  requestId: requestIdSchema,
  side: attachmentSideSchema,
  links: linksSchema.min(1, 'Añade al menos un enlace.'),
});
