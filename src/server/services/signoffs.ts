import type { Department, TshirtSize } from '@/domain/enums';
import type { SessionContext, StageSignoff } from '@/domain/types';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { normalizeSignoffNote, requirementFor, validateSignoffPayload } from '@/domain/signoffs';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { assertInitiativeOpen, loadInitiative } from './blocking';
import { invalid, invalidState, notFound } from './errors';
import { assertPermission, canSignoffStage } from './rbac';

/**
 * Aprobación obligatoria de un área en la fase actual (spec 005 §5.4).
 *
 * Quien aprueba sale SIEMPRE de la sesión validada en el servidor: el cliente
 * no manda identidad. La nota de Legal/Ciberseguridad y la talla de Tech se
 * validan con la misma función que usan el esquema Zod y el formulario.
 */

export interface SetStageSignoffInput {
  initiativeId: string;
  /** Fase que la persona está viendo; si la iniciativa ya avanzó, se rechaza. */
  stageId: number;
  department: Department;
  approved: boolean;
  note?: string | null;
  noObservations?: boolean;
  tshirtSize?: TshirtSize | null;
  now?: Date;
}

export async function setStageSignoff(
  store: DataStore,
  session: SessionContext,
  input: SetStageSignoffInput,
): Promise<StageSignoff> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);
  assertInitiativeOpen(initiative);

  if (input.stageId !== initiative.currentStageId) {
    throw invalid('Solo se aprueba la fase actual de la iniciativa.');
  }
  const stage = await store.stageById(initiative.currentStageId);
  if (!stage) throw notFound('La fase actual de la iniciativa no existe.');

  const requirement = requirementFor(stage.key, input.department);
  if (requirement === null) {
    throw invalid(`${DEPARTMENT_LABELS[input.department]} no aprueba la fase ${stage.name}.`);
  }

  assertPermission(
    canSignoffStage(session, input.department),
    `Esta aprobación la registra ${DEPARTMENT_LABELS[input.department]} o Dirección.`,
  );

  const previous = (await store.listStageSignoffs(initiative.id)).find(
    (row) => row.stageId === stage.id && row.department === input.department,
  );

  let value: StageSignoff;
  if (input.approved) {
    const payload = {
      note: normalizeSignoffNote(input.note),
      noObservations: input.noObservations === true,
      tshirtSize: input.tshirtSize ?? null,
    };
    const problem = validateSignoffPayload(requirement, payload);
    if (problem) throw invalid(problem);
    value = {
      initiativeId: initiative.id,
      stageId: stage.id,
      department: input.department,
      isApproved: true,
      approvedBy: session.userId,
      approvedAt: now.toISOString(),
      note: payload.note,
      noObservations: payload.noObservations,
      // La talla solo tiene sentido donde se exige; en el resto no se guarda.
      tshirtSize: requirement === 'TSHIRT' ? payload.tshirtSize : null,
      updatedAt: now.toISOString(),
    };
  } else {
    if (!previous?.isApproved) throw invalidState('Esa aprobación no estaba registrada.');
    value = {
      initiativeId: initiative.id,
      stageId: stage.id,
      department: input.department,
      isApproved: false,
      approvedBy: null,
      approvedAt: null,
      note: null,
      noObservations: false,
      tshirtSize: null,
      updatedAt: now.toISOString(),
    };
  }

  // Transición condicional: si la iniciativa avanzó o se cerró entretanto, no se escribe nada.
  const stored = await store.upsertStageSignoff(value, { expectedStageId: stage.id });
  if (!stored) throw invalidState('La iniciativa ha cambiado de fase. Recarga la ficha.');

  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: input.approved ? 'STAGE_SIGNOFF_GRANTED' : 'STAGE_SIGNOFF_REVOKED',
    fromStageId: stage.id,
    fieldName: 'stage_signoff',
    // El texto de la nota vive en su tabla: el log guarda solo metadatos (spec 005 §10).
    oldValue: previous
      ? {
          department: previous.department,
          isApproved: previous.isApproved,
          approvedBy: previous.approvedBy,
          tshirtSize: previous.tshirtSize,
          hasNote: previous.note !== null,
          noObservations: previous.noObservations,
        }
      : null,
    newValue: {
      stageKey: stage.key,
      department: value.department,
      isApproved: value.isApproved,
      tshirtSize: value.tshirtSize,
      hasNote: value.note !== null,
      noObservations: value.noObservations,
    },
    at: now,
  });

  return stored;
}
