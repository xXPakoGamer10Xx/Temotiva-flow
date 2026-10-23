import type {
  ActivityLogEntry,
  Attachment,
  ChecklistValue,
  Dependency,
  DepartmentNotificationSetting,
  DocumentShare,
  FeedbackImage,
  FeedbackItem,
  Initiative,
  LibraryDocument,
  NotificationPref,
  PersonalStep,
  StageChecklistItem,
  User,
  WorkflowStage,
} from '@/domain/types';
import type { FeedbackStatus, StageKey } from '@/domain/enums';

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

  // --- Documentos adjuntos (PDF/DOCX) ----------------------------------------
  /** Incluye los retirados: quien pinta decide si los muestra. */
  listAttachments(initiativeId?: string): Promise<Attachment[]>;
  attachmentById(id: string): Promise<Attachment | null>;
  insertAttachment(attachment: Attachment): Promise<Attachment>;
  /** Solo la baja lógica: el resto de la fila es inmutable. */
  markAttachmentRemoved(id: string, removedBy: string, removedAt: string): Promise<Attachment>;

  // --- Biblioteca de documentos -------------------------------------------------
  listDocuments(): Promise<LibraryDocument[]>;
  documentById(id: string): Promise<LibraryDocument | null>;
  insertDocument(document: LibraryDocument): Promise<LibraryDocument>;
  markDocumentRemoved(id: string, removedBy: string, removedAt: string): Promise<LibraryDocument>;
  listDocumentShares(documentId?: string): Promise<DocumentShare[]>;
  insertDocumentShare(share: DocumentShare): Promise<DocumentShare>;
  deleteDocumentShare(id: string): Promise<void>;

  // --- Feedback del equipo ----------------------------------------------------
  listFeedback(): Promise<FeedbackItem[]>;
  feedbackById(id: string): Promise<FeedbackItem | null>;
  insertFeedback(item: FeedbackItem): Promise<FeedbackItem>;
  /** Añade una imagen a un feedback ya creado. */
  appendFeedbackImage(id: string, image: FeedbackImage): Promise<FeedbackItem>;
  updateFeedbackStatus(id: string, status: FeedbackStatus, updatedBy: string, updatedAt: string): Promise<FeedbackItem>;

  // --- Pasos propios (privados) -------------------------------------------------
  /** Siempre acotado a una persona: nadie lista los pasos de otra. */
  listPersonalSteps(initiativeId: string, userId: string): Promise<PersonalStep[]>;
  personalStepById(id: string): Promise<PersonalStep | null>;
  insertPersonalStep(step: PersonalStep): Promise<PersonalStep>;
  setPersonalStepDone(id: string, isDone: boolean): Promise<PersonalStep>;
  /** Son notas privadas, no entidades del flujo: aquí sí se borran de verdad. */
  deletePersonalStep(id: string): Promise<void>;

  // --- Preferencias de notificación -------------------------------------------
  notificationPrefByUser(userId: string): Promise<NotificationPref | null>;
  /** Inserta o reemplaza la preferencia de esa persona. */
  setNotificationPref(pref: NotificationPref): Promise<NotificationPref>;
  listDepartmentNotificationSettings(): Promise<DepartmentNotificationSetting[]>;
  /** Inserta o reemplaza el ajuste de esa área. */
  setDepartmentNotificationSetting(setting: DepartmentNotificationSetting): Promise<DepartmentNotificationSetting>;

  // --- Caja negra (append-only) ----------------------------------------------
  listActivityLog(initiativeId?: string): Promise<ActivityLogEntry[]>;
  appendActivityLog(entry: Omit<ActivityLogEntry, 'id'>): Promise<ActivityLogEntry>;
}
