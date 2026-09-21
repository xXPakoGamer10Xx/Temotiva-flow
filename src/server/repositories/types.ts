import type {
  ActivityLogEntry,
  ChecklistValue,
  Dependency,
  Initiative,
  StageChecklistItem,
  User,
  WorkflowStage,
} from '@/domain/types';
import type { StageKey } from '@/domain/enums';

/**
 * Frontera entre el dominio y la persistencia (DESIGN.md §10.1).
 *
 * Los servicios de dominio solo conocen esta interfaz: cambiar el mock en
 * memoria por PostgreSQL/Supabase no toca ni servicios ni Server Actions.
 *
 * Invariante de auditoría: el log solo expone `appendActivityLog`. No existe
 * ninguna operación de actualización ni de borrado sobre `activity_log`
 * (SEGURIDAD.md §6).
 */
export interface DataStore {
  // --- Usuarios / allowlist de acceso ---------------------------------------
  listUsers(): Promise<User[]>;
  userById(id: string): Promise<User | null>;
  userByEmail(email: string): Promise<User | null>;
  insertUser(user: User): Promise<User>;
  updateUser(id: string, patch: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User>;

  // --- Fases del workflow ----------------------------------------------------
  listStages(): Promise<WorkflowStage[]>;
  stageById(id: number): Promise<WorkflowStage | null>;
  stageByKey(key: StageKey): Promise<WorkflowStage | null>;
  updateStage(id: number, patch: Partial<Pick<WorkflowStage, 'sleHours' | 'wipLimit' | 'isActive'>>): Promise<WorkflowStage>;

  // --- Items de compuerta configurables --------------------------------------
  listChecklistItems(stageId?: number): Promise<StageChecklistItem[]>;
  checklistItemById(id: string): Promise<StageChecklistItem | null>;
  insertChecklistItem(item: StageChecklistItem): Promise<StageChecklistItem>;
  updateChecklistItem(
    id: string,
    patch: Partial<Pick<StageChecklistItem, 'label' | 'description' | 'isMandatory' | 'responsibleDepartment'>>,
  ): Promise<StageChecklistItem>;
  deleteChecklistItem(id: string): Promise<void>;

  // --- Iniciativas -----------------------------------------------------------
  listInitiatives(options?: { includeArchived?: boolean }): Promise<Initiative[]>;
  initiativeById(id: string): Promise<Initiative | null>;
  insertInitiative(initiative: Initiative): Promise<Initiative>;
  updateInitiative(id: string, patch: Partial<Omit<Initiative, 'id' | 'createdAt' | 'createdBy'>>): Promise<Initiative>;
  nextInitiativeId(): Promise<string>;

  // --- Valores de compuerta por iniciativa -----------------------------------
  listChecklistValues(initiativeId?: string): Promise<ChecklistValue[]>;
  upsertChecklistValue(value: ChecklistValue): Promise<ChecklistValue>;

  // --- Dependencias (🆘) ------------------------------------------------------
  listDependencies(initiativeId?: string): Promise<Dependency[]>;
  dependencyById(id: string): Promise<Dependency | null>;
  insertDependency(dependency: Dependency): Promise<Dependency>;
  updateDependency(
    id: string,
    patch: Partial<Pick<Dependency, 'status' | 'resolutionNotes' | 'resolvedBy' | 'resolvedAt'>>,
  ): Promise<Dependency>;

  // --- Caja negra (append-only) ----------------------------------------------
  listActivityLog(initiativeId?: string): Promise<ActivityLogEntry[]>;
  appendActivityLog(entry: Omit<ActivityLogEntry, 'id'>): Promise<ActivityLogEntry>;
}
