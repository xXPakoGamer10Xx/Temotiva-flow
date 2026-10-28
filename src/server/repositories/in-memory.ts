import { randomUUID } from 'node:crypto';
import type {
  ActivityLogEntry,
  AreaLink,
  Attachment,
  DeptTask,
  DepartmentNotificationSetting,
  DocumentShare,
  FeedbackImage,
  FeedbackItem,
  NotificationPref,
  PersonalStep,
  ChecklistValue,
  Dependency,
  Initiative,
  LibraryDocument,
  StageChecklistItem,
  User,
  WorkflowStage,
} from '@/domain/types';
import type { FeedbackStatus, StageKey } from '@/domain/enums';
import { buildSeedData, type SeedData } from '@/domain/seed';
import type { DataStore } from './types';

/** Copia defensiva: nadie fuera del store puede mutar una fila por referencia. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Implementación V1 de `DataStore` (DESIGN.md §10.2).
 *
 * Vive únicamente en el proceso del servidor: el navegador jamás la toca, solo
 * recibe proyecciones de solo lectura (AGENTS.md §4.2). La persistencia
 * opcional en disco se inyecta como `onChange` para no acoplar el store al
 * sistema de archivos.
 */
export class InMemoryDataStore implements DataStore {
  private users = new Map<string, User>();
  private stages = new Map<number, WorkflowStage>();
  private checklistItems = new Map<string, StageChecklistItem>();
  private initiatives = new Map<string, Initiative>();
  private checklistValues = new Map<string, ChecklistValue>();
  private dependencies = new Map<string, Dependency>();
  private attachments = new Map<string, Attachment>();
  private documents = new Map<string, LibraryDocument>();
  private documentShares = new Map<string, DocumentShare>();
  private feedback = new Map<string, FeedbackItem>();
  private personalSteps = new Map<string, PersonalStep>();
  private areaLinks = new Map<string, AreaLink>();
  private deptTasks = new Map<string, DeptTask>();
  private notificationPrefs = new Map<string, NotificationPref>();
  private departmentNotificationSettings = new Map<string, DepartmentNotificationSetting>();
  private activityLog: ActivityLogEntry[] = [];
  private onChange: (() => void) | null = null;

  constructor(data: SeedData = buildSeedData()) {
    this.hydrate(data);
  }

  /** Reemplaza el contenido completo (arranque desde seed o desde snapshot). */
  hydrate(data: SeedData): void {
    this.users = new Map(data.users.map((user) => [user.id, clone(user)]));
    this.stages = new Map(data.stages.map((stage) => [stage.id, clone(stage)]));
    this.checklistItems = new Map(data.checklistItems.map((item) => [item.id, clone(item)]));
    // Snapshots anteriores a la ruta de fases no traen `skippedStageIds`.
    this.initiatives = new Map(
      data.initiatives.map((initiative) => [initiative.id, clone({ ...initiative, skippedStageIds: initiative.skippedStageIds ?? [] })]),
    );
    this.checklistValues = new Map(
      data.checklistValues.map((value) => [checklistValueKey(value.initiativeId, value.checklistId), clone(value)]),
    );
    this.dependencies = new Map(data.dependencies.map((dependency) => [dependency.id, clone(dependency)]));
    this.attachments = new Map((data.attachments ?? []).map((attachment) => [attachment.id, clone(attachment)]));
    this.documents = new Map((data.documents ?? []).map((document) => [document.id, clone(document)]));
    this.documentShares = new Map((data.documentShares ?? []).map((share) => [share.id, clone(share)]));
    this.areaLinks = new Map((data.areaLinks ?? []).map((link) => [link.id, clone(link)]));
    this.deptTasks = new Map((data.deptTasks ?? []).map((task) => [task.id, clone(task)]));
    this.feedback = new Map((data.feedback ?? []).map((item) => [item.id, clone({ ...item, images: item.images ?? [] })]));
    this.personalSteps = new Map((data.personalSteps ?? []).map((step) => [step.id, clone(step)]));
    this.notificationPrefs = new Map((data.notificationPrefs ?? []).map((pref) => [pref.userId, clone(pref)]));
    this.departmentNotificationSettings = new Map(
      (data.departmentNotificationSettings ?? []).map((setting) => [setting.department, clone(setting)]),
    );
    this.activityLog = data.activityLog.map((entry) => clone(entry));
  }

  /** Vuelca el estado completo (lo usa la capa de snapshot). */
  snapshot(): SeedData {
    return {
      users: [...this.users.values()].map(clone),
      stages: [...this.stages.values()].map(clone),
      checklistItems: [...this.checklistItems.values()].map(clone),
      initiatives: [...this.initiatives.values()].map(clone),
      checklistValues: [...this.checklistValues.values()].map(clone),
      dependencies: [...this.dependencies.values()].map(clone),
      attachments: [...this.attachments.values()].map(clone),
      documents: [...this.documents.values()].map(clone),
      documentShares: [...this.documentShares.values()].map(clone),
      areaLinks: [...this.areaLinks.values()].map(clone),
      deptTasks: [...this.deptTasks.values()].map(clone),
      feedback: [...this.feedback.values()].map(clone),
      personalSteps: [...this.personalSteps.values()].map(clone),
      notificationPrefs: [...this.notificationPrefs.values()].map(clone),
      departmentNotificationSettings: [...this.departmentNotificationSettings.values()].map(clone),
      activityLog: this.activityLog.map(clone),
    };
  }

  setChangeListener(listener: (() => void) | null): void {
    this.onChange = listener;
  }

  private touched(): void {
    this.onChange?.();
  }

  // --- Usuarios ---------------------------------------------------------------

  async listUsers(): Promise<User[]> {
    return [...this.users.values()].map(clone).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async userById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? clone(user) : null;
  }

  async userByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) return clone(user);
    }
    return null;
  }

  async insertUser(user: User): Promise<User> {
    this.users.set(user.id, clone(user));
    this.touched();
    return clone(user);
  }

  async updateUser(id: string, patch: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User> {
    const current = this.users.get(id);
    if (!current) throw new Error(`Usuario no encontrado: ${id}`);
    const updated: User = { ...current, ...patch };
    this.users.set(id, updated);
    this.touched();
    return clone(updated);
  }

  // --- Fases ------------------------------------------------------------------

  async listStages(): Promise<WorkflowStage[]> {
    return [...this.stages.values()].map(clone).sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async stageById(id: number): Promise<WorkflowStage | null> {
    const stage = this.stages.get(id);
    return stage ? clone(stage) : null;
  }

  async stageByKey(key: StageKey): Promise<WorkflowStage | null> {
    for (const stage of this.stages.values()) {
      if (stage.key === key) return clone(stage);
    }
    return null;
  }

  async updateStage(
    id: number,
    patch: Partial<Pick<WorkflowStage, 'sleHours' | 'wipLimit' | 'isActive'>>,
  ): Promise<WorkflowStage> {
    const current = this.stages.get(id);
    if (!current) throw new Error(`Fase no encontrada: ${id}`);
    const updated: WorkflowStage = { ...current, ...patch };
    this.stages.set(id, updated);
    this.touched();
    return clone(updated);
  }

  // --- Items de compuerta ------------------------------------------------------

  async listChecklistItems(stageId?: number): Promise<StageChecklistItem[]> {
    return [...this.checklistItems.values()]
      .filter((item) => stageId === undefined || item.stageId === stageId)
      .map(clone)
      .sort((a, b) => a.stageId - b.stageId || a.orderIndex - b.orderIndex);
  }

  async checklistItemById(id: string): Promise<StageChecklistItem | null> {
    const item = this.checklistItems.get(id);
    return item ? clone(item) : null;
  }

  async insertChecklistItem(item: StageChecklistItem): Promise<StageChecklistItem> {
    this.checklistItems.set(item.id, clone(item));
    this.touched();
    return clone(item);
  }

  async updateChecklistItem(
    id: string,
    patch: Partial<Pick<StageChecklistItem, 'label' | 'description' | 'isMandatory' | 'responsibleDepartment'>>,
  ): Promise<StageChecklistItem> {
    const current = this.checklistItems.get(id);
    if (!current) throw new Error(`Item de compuerta no encontrado: ${id}`);
    const updated: StageChecklistItem = { ...current, ...patch };
    this.checklistItems.set(id, updated);
    this.touched();
    return clone(updated);
  }

  async deleteChecklistItem(id: string): Promise<void> {
    this.checklistItems.delete(id);
    for (const [key, value] of this.checklistValues) {
      if (value.checklistId === id) this.checklistValues.delete(key);
    }
    this.touched();
  }

  // --- Iniciativas --------------------------------------------------------------

  async listInitiatives(options?: { includeArchived?: boolean }): Promise<Initiative[]> {
    const includeArchived = options?.includeArchived ?? false;
    return [...this.initiatives.values()]
      .filter((initiative) => includeArchived || !initiative.isArchived)
      .map(clone)
      .sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));
  }

  async initiativeById(id: string): Promise<Initiative | null> {
    const initiative = this.initiatives.get(id);
    return initiative ? clone(initiative) : null;
  }

  async insertInitiative(initiative: Initiative): Promise<Initiative> {
    this.initiatives.set(initiative.id, clone(initiative));
    this.touched();
    return clone(initiative);
  }

  async updateInitiative(
    id: string,
    patch: Partial<Omit<Initiative, 'id' | 'createdAt' | 'createdBy'>>,
  ): Promise<Initiative> {
    const current = this.initiatives.get(id);
    if (!current) throw new Error(`Iniciativa no encontrada: ${id}`);
    const updated: Initiative = { ...current, ...patch };
    this.initiatives.set(id, updated);
    this.touched();
    return clone(updated);
  }

  async nextInitiativeId(): Promise<string> {
    let max = 100;
    for (const id of this.initiatives.keys()) {
      const parsed = Number.parseInt(id.replace('TEMO-', ''), 10);
      if (Number.isFinite(parsed) && parsed > max) max = parsed;
    }
    return `TEMO-${max + 1}`;
  }

  // --- Valores de compuerta -------------------------------------------------------

  async listChecklistValues(initiativeId?: string): Promise<ChecklistValue[]> {
    return [...this.checklistValues.values()]
      .filter((value) => initiativeId === undefined || value.initiativeId === initiativeId)
      .map(clone);
  }

  async upsertChecklistValue(value: ChecklistValue): Promise<ChecklistValue> {
    this.checklistValues.set(checklistValueKey(value.initiativeId, value.checklistId), clone(value));
    this.touched();
    return clone(value);
  }

  // --- Dependencias ----------------------------------------------------------------

  async listDependencies(initiativeId?: string): Promise<Dependency[]> {
    return [...this.dependencies.values()]
      .filter((dependency) => initiativeId === undefined || dependency.initiativeId === initiativeId)
      .map(clone)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async dependencyById(id: string): Promise<Dependency | null> {
    const dependency = this.dependencies.get(id);
    return dependency ? clone(dependency) : null;
  }

  async listAttachments(initiativeId?: string): Promise<Attachment[]> {
    return [...this.attachments.values()]
      .filter((attachment) => !initiativeId || attachment.initiativeId === initiativeId)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
      .map(clone);
  }

  async attachmentById(id: string): Promise<Attachment | null> {
    const attachment = this.attachments.get(id);
    return attachment ? clone(attachment) : null;
  }

  async insertAttachment(attachment: Attachment): Promise<Attachment> {
    this.attachments.set(attachment.id, clone(attachment));
    this.touched();
    return clone(attachment);
  }

  async markAttachmentRemoved(id: string, removedBy: string, removedAt: string): Promise<Attachment> {
    const current = this.attachments.get(id);
    if (!current) throw new Error(`Documento no encontrado: ${id}`);
    const updated: Attachment = { ...current, isRemoved: true, removedBy, removedAt };
    this.attachments.set(id, updated);
    this.touched();
    return clone(updated);
  }

  async listDocuments(): Promise<LibraryDocument[]> {
    return [...this.documents.values()].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).map(clone);
  }

  async documentById(id: string): Promise<LibraryDocument | null> {
    const document = this.documents.get(id);
    return document ? clone(document) : null;
  }

  async insertDocument(document: LibraryDocument): Promise<LibraryDocument> {
    this.documents.set(document.id, clone(document));
    this.touched();
    return clone(document);
  }

  async markDocumentRemoved(id: string, removedBy: string, removedAt: string): Promise<LibraryDocument> {
    const current = this.documents.get(id);
    if (!current) throw new Error(`Documento no encontrado: ${id}`);
    const updated: LibraryDocument = { ...current, isRemoved: true, removedBy, removedAt };
    this.documents.set(id, updated);
    this.touched();
    return clone(updated);
  }

  async listAreaLinks(): Promise<AreaLink[]> {
    return [...this.areaLinks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
  }

  async areaLinkById(id: string): Promise<AreaLink | null> {
    const link = this.areaLinks.get(id);
    return link ? clone(link) : null;
  }

  async insertAreaLink(link: AreaLink): Promise<AreaLink> {
    this.areaLinks.set(link.id, clone(link));
    this.touched();
    return clone(link);
  }

  async markAreaLinkRemoved(id: string, removedBy: string, removedAt: string): Promise<AreaLink> {
    const current = this.areaLinks.get(id);
    if (!current) throw new Error(`Enlace no encontrado: ${id}`);
    const updated: AreaLink = { ...current, isRemoved: true, removedBy, removedAt };
    this.areaLinks.set(id, updated);
    this.touched();
    return clone(updated);
  }

  async listDeptTasks(): Promise<DeptTask[]> {
    return [...this.deptTasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
  }

  async deptTaskById(id: string): Promise<DeptTask | null> {
    const task = this.deptTasks.get(id);
    return task ? clone(task) : null;
  }

  async insertDeptTask(task: DeptTask): Promise<DeptTask> {
    this.deptTasks.set(task.id, clone(task));
    this.touched();
    return clone(task);
  }

  async updateDeptTask(
    id: string,
    patch: Partial<Pick<DeptTask, 'status' | 'assigneeId' | 'isArchived' | 'updatedAt'>>,
  ): Promise<DeptTask> {
    const current = this.deptTasks.get(id);
    if (!current) throw new Error(`Tarea no encontrada: ${id}`);
    const updated: DeptTask = { ...current, ...patch };
    this.deptTasks.set(id, updated);
    this.touched();
    return clone(updated);
  }

  async listDocumentShares(documentId?: string): Promise<DocumentShare[]> {
    return [...this.documentShares.values()]
      .filter((share) => !documentId || share.documentId === documentId)
      .sort((a, b) => a.sharedAt.localeCompare(b.sharedAt))
      .map(clone);
  }

  async insertDocumentShare(share: DocumentShare): Promise<DocumentShare> {
    this.documentShares.set(share.id, clone(share));
    this.touched();
    return clone(share);
  }

  async deleteDocumentShare(id: string): Promise<void> {
    this.documentShares.delete(id);
    this.touched();
  }

  async listFeedback(): Promise<FeedbackItem[]> {
    return [...this.feedback.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
  }

  async feedbackById(id: string): Promise<FeedbackItem | null> {
    const item = this.feedback.get(id);
    return item ? clone(item) : null;
  }

  async insertFeedback(item: FeedbackItem): Promise<FeedbackItem> {
    this.feedback.set(item.id, clone(item));
    this.touched();
    return clone(item);
  }

  async appendFeedbackImage(id: string, image: FeedbackImage): Promise<FeedbackItem> {
    const current = this.feedback.get(id);
    if (!current) throw new Error(`Feedback no encontrado: ${id}`);
    const updated: FeedbackItem = { ...current, images: [...(current.images ?? []), clone(image)] };
    this.feedback.set(id, updated);
    this.touched();
    return clone(updated);
  }

  async updateFeedbackStatus(
    id: string,
    status: FeedbackStatus,
    updatedBy: string,
    updatedAt: string,
  ): Promise<FeedbackItem> {
    const current = this.feedback.get(id);
    if (!current) throw new Error(`Feedback no encontrado: ${id}`);
    const updated: FeedbackItem = { ...current, status, updatedBy, updatedAt };
    this.feedback.set(id, updated);
    this.touched();
    return clone(updated);
  }

  async listPersonalSteps(initiativeId: string, userId: string): Promise<PersonalStep[]> {
    return [...this.personalSteps.values()]
      .filter((step) => step.initiativeId === initiativeId && step.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(clone);
  }

  async personalStepById(id: string): Promise<PersonalStep | null> {
    const step = this.personalSteps.get(id);
    return step ? clone(step) : null;
  }

  async insertPersonalStep(step: PersonalStep): Promise<PersonalStep> {
    this.personalSteps.set(step.id, clone(step));
    this.touched();
    return clone(step);
  }

  async setPersonalStepDone(id: string, isDone: boolean): Promise<PersonalStep> {
    const current = this.personalSteps.get(id);
    if (!current) throw new Error(`Paso no encontrado: ${id}`);
    const updated: PersonalStep = { ...current, isDone };
    this.personalSteps.set(id, updated);
    this.touched();
    return clone(updated);
  }

  async deletePersonalStep(id: string): Promise<void> {
    this.personalSteps.delete(id);
    this.touched();
  }

  async notificationPrefByUser(userId: string): Promise<NotificationPref | null> {
    const pref = this.notificationPrefs.get(userId);
    return pref ? clone(pref) : null;
  }

  async setNotificationPref(pref: NotificationPref): Promise<NotificationPref> {
    this.notificationPrefs.set(pref.userId, clone(pref));
    this.touched();
    return clone(pref);
  }

  async listDepartmentNotificationSettings(): Promise<DepartmentNotificationSetting[]> {
    return [...this.departmentNotificationSettings.values()].map(clone);
  }

  async setDepartmentNotificationSetting(setting: DepartmentNotificationSetting): Promise<DepartmentNotificationSetting> {
    this.departmentNotificationSettings.set(setting.department, clone(setting));
    this.touched();
    return clone(setting);
  }

  async insertDependency(dependency: Dependency): Promise<Dependency> {
    this.dependencies.set(dependency.id, clone(dependency));
    this.touched();
    return clone(dependency);
  }

  async updateDependency(
    id: string,
    patch: Partial<Pick<Dependency, 'status' | 'resolutionNotes' | 'resolvedBy' | 'resolvedAt'>>,
  ): Promise<Dependency> {
    const current = this.dependencies.get(id);
    if (!current) throw new Error(`Dependencia no encontrada: ${id}`);
    const updated: Dependency = { ...current, ...patch };
    this.dependencies.set(id, updated);
    this.touched();
    return clone(updated);
  }

  // --- Caja negra --------------------------------------------------------------------

  async listActivityLog(initiativeId?: string): Promise<ActivityLogEntry[]> {
    return this.activityLog
      .filter((entry) => initiativeId === undefined || entry.initiativeId === initiativeId)
      .map(clone)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Única vía de escritura del log. No hay update ni delete: la caja negra es
   * append-only por diseño (SEGURIDAD.md §6).
   */
  async appendActivityLog(entry: Omit<ActivityLogEntry, 'id'>): Promise<ActivityLogEntry> {
    const stored: ActivityLogEntry = Object.freeze({ ...clone(entry), id: randomUUID() });
    this.activityLog.push(stored);
    this.touched();
    return stored;
  }
}

function checklistValueKey(initiativeId: string, checklistId: string): string {
  return `${initiativeId}::${checklistId}`;
}
