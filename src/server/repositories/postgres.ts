import 'server-only';
import { Pool, type PoolConfig } from 'pg';
import type {
  ActivityLogEntry,
  ChecklistValue,
  Dependency,
  Initiative,
  StageChecklistItem,
  User,
  WorkflowStage,
} from '@/domain/types';
import type { Department, HelpStatus, HelpType, PriorityLevel, PriorityReason, StageKey, StopReason, UserRole } from '@/domain/enums';
import type { DataStore } from './types';

const POOL_KEY = Symbol.for('temotiva-flow.pgpool');
type GlobalWithPool = typeof globalThis & { [POOL_KEY]?: Pool };

function getPool(): Pool {
  const globalScope = globalThis as GlobalWithPool;
  if (!globalScope[POOL_KEY]) {
    const connectionString =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.STORAGE_URL ||
      process.env.STORAGE_DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL o POSTGRES_URL no está definida en las variables de entorno.');
    }
    const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    const config: PoolConfig = {
      connectionString,
      // Cada instancia serverless tiene su propio pool: pocas conexiones por instancia.
      max: process.env.NODE_ENV === 'production' ? 3 : 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    };
    globalScope[POOL_KEY] = new Pool(config);
  }
  return globalScope[POOL_KEY];
}

function toIso(date: unknown): string {
  if (date instanceof Date) return date.toISOString();
  if (typeof date === 'string') return date;
  return new Date().toISOString();
}

function toNullableIso(date: unknown): string | null {
  if (!date) return null;
  if (date instanceof Date) return date.toISOString();
  if (typeof date === 'string') return date;
  return null;
}

export class PostgresDataStore implements DataStore {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getPool();
  }

  // --- Usuarios / allowlist de acceso ---------------------------------------

  async listUsers(): Promise<User[]> {
    const query = `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role, 
        u.is_active, 
        u.is_anonymized, 
        u.created_at,
        COALESCE(
          (SELECT array_agg(ud.department::text) FROM user_departments ud WHERE ud.user_id = u.id),
          ARRAY[]::text[]
        ) AS departments
      FROM users u
      ORDER BY u.name ASC
    `;
    const res = await this.pool.query(query);
    return res.rows.map((r) => this.mapUser(r));
  }

  async userById(id: string): Promise<User | null> {
    const query = `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role, 
        u.is_active, 
        u.is_anonymized, 
        u.created_at,
        COALESCE(
          (SELECT array_agg(ud.department::text) FROM user_departments ud WHERE ud.user_id = u.id),
          ARRAY[]::text[]
        ) AS departments
      FROM users u
      WHERE u.id = $1
    `;
    const res = await this.pool.query(query, [id]);
    if (res.rows.length === 0) return null;
    return this.mapUser(res.rows[0]);
  }

  async userByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    const query = `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role, 
        u.is_active, 
        u.is_anonymized, 
        u.created_at,
        COALESCE(
          (SELECT array_agg(ud.department::text) FROM user_departments ud WHERE ud.user_id = u.id),
          ARRAY[]::text[]
        ) AS departments
      FROM users u
      WHERE LOWER(u.email) = $1
    `;
    const res = await this.pool.query(query, [normalized]);
    if (res.rows.length === 0) return null;
    return this.mapUser(res.rows[0]);
  }

  async insertUser(user: User): Promise<User> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (id, name, email, role, is_active, is_anonymized, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [user.id, user.name, user.email, user.role, user.isActive, user.isAnonymized, user.createdAt],
      );
      for (const dept of user.departments) {
        await client.query(
          `INSERT INTO user_departments (user_id, department) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [user.id, dept],
        );
      }
      await client.query('COMMIT');
      return user;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async updateUser(id: string, patch: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sets: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (patch.name !== undefined) {
        sets.push(`name = $${idx++}`);
        values.push(patch.name);
      }
      if (patch.email !== undefined) {
        sets.push(`email = $${idx++}`);
        values.push(patch.email);
      }
      if (patch.role !== undefined) {
        sets.push(`role = $${idx++}`);
        values.push(patch.role);
      }
      if (patch.isActive !== undefined) {
        sets.push(`is_active = $${idx++}`);
        values.push(patch.isActive);
      }
      if (patch.isAnonymized !== undefined) {
        sets.push(`is_anonymized = $${idx++}`);
        values.push(patch.isAnonymized);
      }

      if (sets.length > 0) {
        values.push(id);
        await client.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}`, values);
      }

      if (patch.departments !== undefined) {
        await client.query(`DELETE FROM user_departments WHERE user_id = $1`, [id]);
        for (const dept of patch.departments) {
          await client.query(
            `INSERT INTO user_departments (user_id, department) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [id, dept],
          );
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const updated = await this.userById(id);
    if (!updated) throw new Error(`Usuario no encontrado tras actualizar: ${id}`);
    return updated;
  }

  // --- Fases del workflow ----------------------------------------------------

  async listStages(): Promise<WorkflowStage[]> {
    const res = await this.pool.query(
      `SELECT id, key, name, order_index, default_owner_department, sle_hours, wip_limit, is_active, purpose
       FROM workflow_stages
       ORDER BY order_index ASC`,
    );
    return res.rows.map((r) => this.mapStage(r));
  }

  async stageById(id: number): Promise<WorkflowStage | null> {
    const res = await this.pool.query(
      `SELECT id, key, name, order_index, default_owner_department, sle_hours, wip_limit, is_active, purpose
       FROM workflow_stages
       WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return this.mapStage(res.rows[0]);
  }

  async stageByKey(key: StageKey): Promise<WorkflowStage | null> {
    const res = await this.pool.query(
      `SELECT id, key, name, order_index, default_owner_department, sle_hours, wip_limit, is_active, purpose
       FROM workflow_stages
       WHERE key = $1`,
      [key],
    );
    if (res.rows.length === 0) return null;
    return this.mapStage(res.rows[0]);
  }

  async updateStage(
    id: number,
    patch: Partial<Pick<WorkflowStage, 'sleHours' | 'wipLimit' | 'isActive'>>,
  ): Promise<WorkflowStage> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (patch.sleHours !== undefined) {
      sets.push(`sle_hours = $${idx++}`);
      values.push(patch.sleHours);
    }
    if (patch.wipLimit !== undefined) {
      sets.push(`wip_limit = $${idx++}`);
      values.push(patch.wipLimit);
    }
    if (patch.isActive !== undefined) {
      sets.push(`is_active = $${idx++}`);
      values.push(patch.isActive);
    }

    if (sets.length > 0) {
      values.push(id);
      await this.pool.query(`UPDATE workflow_stages SET ${sets.join(', ')} WHERE id = $${idx}`, values);
    }

    const updated = await this.stageById(id);
    if (!updated) throw new Error(`Fase no encontrada tras actualizar: ${id}`);
    return updated;
  }

  // --- Items de compuerta configurables --------------------------------------

  async listChecklistItems(stageId?: number): Promise<StageChecklistItem[]> {
    const query = stageId !== undefined
      ? `SELECT id, stage_id, label, description, order_index, is_mandatory, responsible_department, created_at
         FROM stage_checklists WHERE stage_id = $1 ORDER BY stage_id ASC, order_index ASC`
      : `SELECT id, stage_id, label, description, order_index, is_mandatory, responsible_department, created_at
         FROM stage_checklists ORDER BY stage_id ASC, order_index ASC`;
    const params = stageId !== undefined ? [stageId] : [];
    const res = await this.pool.query(query, params);
    return res.rows.map((r) => this.mapChecklistItem(r));
  }

  async checklistItemById(id: string): Promise<StageChecklistItem | null> {
    const res = await this.pool.query(
      `SELECT id, stage_id, label, description, order_index, is_mandatory, responsible_department, created_at
       FROM stage_checklists WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return this.mapChecklistItem(res.rows[0]);
  }

  async insertChecklistItem(item: StageChecklistItem): Promise<StageChecklistItem> {
    await this.pool.query(
      `INSERT INTO stage_checklists (id, stage_id, label, description, order_index, is_mandatory, responsible_department, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [item.id, item.stageId, item.label, item.description, item.orderIndex, item.isMandatory, item.responsibleDepartment, item.createdAt],
    );
    return item;
  }

  async updateChecklistItem(
    id: string,
    patch: Partial<Pick<StageChecklistItem, 'label' | 'description' | 'isMandatory' | 'responsibleDepartment'>>,
  ): Promise<StageChecklistItem> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (patch.label !== undefined) {
      sets.push(`label = $${idx++}`);
      values.push(patch.label);
    }
    if (patch.description !== undefined) {
      sets.push(`description = $${idx++}`);
      values.push(patch.description);
    }
    if (patch.isMandatory !== undefined) {
      sets.push(`is_mandatory = $${idx++}`);
      values.push(patch.isMandatory);
    }
    if (patch.responsibleDepartment !== undefined) {
      sets.push(`responsible_department = $${idx++}`);
      values.push(patch.responsibleDepartment);
    }

    if (sets.length > 0) {
      values.push(id);
      await this.pool.query(`UPDATE stage_checklists SET ${sets.join(', ')} WHERE id = $${idx}`, values);
    }

    const updated = await this.checklistItemById(id);
    if (!updated) throw new Error(`Item de compuerta no encontrado: ${id}`);
    return updated;
  }

  async deleteChecklistItem(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM stage_checklists WHERE id = $1`, [id]);
  }

  // --- Iniciativas -----------------------------------------------------------

  async listInitiatives(options?: { includeArchived?: boolean }): Promise<Initiative[]> {
    const where = options?.includeArchived ? '' : 'WHERE NOT is_archived';
    const res = await this.pool.query(
      `SELECT 
        id, title, description, priority, priority_reason, current_stage_id, owner_department,
        current_assignee_id, created_by, is_blocked, stop_reason, blocked_description,
        manual_stop_reason, manual_stop_description, blocked_since, blocked_started_at,
        blocked_ms_in_stage, current_task, links, is_archived, stage_entered_at, created_at, updated_at
       FROM initiatives
       ${where}
       ORDER BY updated_at DESC`,
    );
    return res.rows.map((r) => this.mapInitiative(r));
  }

  async initiativeById(id: string): Promise<Initiative | null> {
    const res = await this.pool.query(
      `SELECT 
        id, title, description, priority, priority_reason, current_stage_id, owner_department,
        current_assignee_id, created_by, is_blocked, stop_reason, blocked_description,
        manual_stop_reason, manual_stop_description, blocked_since, blocked_started_at,
        blocked_ms_in_stage, current_task, links, is_archived, stage_entered_at, created_at, updated_at
       FROM initiatives
       WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return this.mapInitiative(res.rows[0]);
  }

  async insertInitiative(initiative: Initiative): Promise<Initiative> {
    await this.pool.query(
      `INSERT INTO initiatives (
        id, title, description, priority, priority_reason, current_stage_id, owner_department,
        current_assignee_id, created_by, is_blocked, stop_reason, blocked_description,
        manual_stop_reason, manual_stop_description, blocked_since, blocked_started_at,
        blocked_ms_in_stage, current_task, links, is_archived, stage_entered_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23
      )`,
      [
        initiative.id,
        initiative.title,
        initiative.description,
        initiative.priority,
        initiative.priorityReason,
        initiative.currentStageId,
        initiative.ownerDepartment,
        initiative.currentAssigneeId,
        initiative.createdBy,
        initiative.isBlocked,
        initiative.stopReason,
        initiative.blockedDescription,
        initiative.manualStopReason,
        initiative.manualStopDescription,
        initiative.blockedSince,
        initiative.blockedStartedAt,
        initiative.blockedMsInStage,
        initiative.currentTask,
        JSON.stringify(initiative.links ?? []),
        initiative.isArchived,
        initiative.stageEnteredAt,
        initiative.createdAt,
        initiative.updatedAt,
      ],
    );
    return initiative;
  }

  async updateInitiative(
    id: string,
    patch: Partial<Omit<Initiative, 'id' | 'createdAt' | 'createdBy'>>,
  ): Promise<Initiative> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      priority: 'priority',
      priorityReason: 'priority_reason',
      currentStageId: 'current_stage_id',
      ownerDepartment: 'owner_department',
      currentAssigneeId: 'current_assignee_id',
      isBlocked: 'is_blocked',
      stopReason: 'stop_reason',
      blockedDescription: 'blocked_description',
      manualStopReason: 'manual_stop_reason',
      manualStopDescription: 'manual_stop_description',
      blockedSince: 'blocked_since',
      blockedStartedAt: 'blocked_started_at',
      blockedMsInStage: 'blocked_ms_in_stage',
      currentTask: 'current_task',
      isArchived: 'is_archived',
      stageEnteredAt: 'stage_entered_at',
      updatedAt: 'updated_at',
    };

    for (const [key, col] of Object.entries(columnMap)) {
      if (key in patch) {
        sets.push(`${col} = $${idx++}`);
        values.push((patch as Record<string, unknown>)[key]);
      }
    }

    if ('links' in patch) {
      sets.push(`links = $${idx++}`);
      values.push(JSON.stringify(patch.links ?? []));
    }

    if (sets.length > 0) {
      values.push(id);
      await this.pool.query(`UPDATE initiatives SET ${sets.join(', ')} WHERE id = $${idx}`, values);
    }

    const updated = await this.initiativeById(id);
    if (!updated) throw new Error(`Iniciativa no encontrada tras actualizar: ${id}`);
    return updated;
  }

  async nextInitiativeId(): Promise<string> {
    const res = await this.pool.query(
      `SELECT COALESCE(MAX(NULLIF(SUBSTRING(id FROM 6), '')::integer), 100) AS max_num
       FROM initiatives
       WHERE id ~ '^TEMO-[0-9]+$'`,
    );
    const max = Number(res.rows[0]?.max_num ?? 100);
    return `TEMO-${max + 1}`;
  }

  // --- Valores de compuerta por iniciativa -----------------------------------

  async listChecklistValues(initiativeId?: string): Promise<ChecklistValue[]> {
    const query = initiativeId
      ? `SELECT initiative_id, checklist_id, is_completed, completed_by, completed_at
         FROM initiative_checklist_values WHERE initiative_id = $1`
      : `SELECT initiative_id, checklist_id, is_completed, completed_by, completed_at
         FROM initiative_checklist_values`;
    const params = initiativeId ? [initiativeId] : [];
    const res = await this.pool.query(query, params);
    return res.rows.map((r) => ({
      initiativeId: r.initiative_id,
      checklistId: r.checklist_id,
      isCompleted: Boolean(r.is_completed),
      completedBy: r.completed_by ?? null,
      completedAt: toNullableIso(r.completed_at),
    }));
  }

  async upsertChecklistValue(value: ChecklistValue): Promise<ChecklistValue> {
    await this.pool.query(
      `INSERT INTO initiative_checklist_values (initiative_id, checklist_id, is_completed, completed_by, completed_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (initiative_id, checklist_id)
       DO UPDATE SET
         is_completed = EXCLUDED.is_completed,
         completed_by = EXCLUDED.completed_by,
         completed_at = EXCLUDED.completed_at`,
      [value.initiativeId, value.checklistId, value.isCompleted, value.completedBy, value.completedAt],
    );
    return value;
  }

  // --- Dependencias (🆘) ------------------------------------------------------

  async listDependencies(initiativeId?: string): Promise<Dependency[]> {
    const query = initiativeId
      ? `SELECT 
          id, initiative_id, requested_by, target_department, help_type,
          is_blocking, description, checklist_item_id, status, resolution_notes,
          resolved_by, created_at, resolved_at
         FROM initiative_dependencies WHERE initiative_id = $1
         ORDER BY created_at DESC`
      : `SELECT 
          id, initiative_id, requested_by, target_department, help_type,
          is_blocking, description, checklist_item_id, status, resolution_notes,
          resolved_by, created_at, resolved_at
         FROM initiative_dependencies
         ORDER BY created_at DESC`;
    const params = initiativeId ? [initiativeId] : [];
    const res = await this.pool.query(query, params);
    return res.rows.map((r) => this.mapDependency(r));
  }

  async dependencyById(id: string): Promise<Dependency | null> {
    const res = await this.pool.query(
      `SELECT 
        id, initiative_id, requested_by, target_department, help_type,
        is_blocking, description, checklist_item_id, status, resolution_notes,
        resolved_by, created_at, resolved_at
       FROM initiative_dependencies WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return this.mapDependency(res.rows[0]);
  }

  async insertDependency(dependency: Dependency): Promise<Dependency> {
    await this.pool.query(
      `INSERT INTO initiative_dependencies (
        id, initiative_id, requested_by, target_department, help_type,
        is_blocking, description, checklist_item_id, status, resolution_notes,
        resolved_by, created_at, resolved_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13
      )`,
      [
        dependency.id,
        dependency.initiativeId,
        dependency.requestedBy,
        dependency.targetDepartment,
        dependency.helpType,
        dependency.isBlocking,
        dependency.description,
        dependency.checklistItemId,
        dependency.status,
        dependency.resolutionNotes,
        dependency.resolvedBy,
        dependency.createdAt,
        dependency.resolvedAt,
      ],
    );
    return dependency;
  }

  async updateDependency(
    id: string,
    patch: Partial<Pick<Dependency, 'status' | 'resolutionNotes' | 'resolvedBy' | 'resolvedAt'>>,
  ): Promise<Dependency> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (patch.status !== undefined) {
      sets.push(`status = $${idx++}`);
      values.push(patch.status);
    }
    if (patch.resolutionNotes !== undefined) {
      sets.push(`resolution_notes = $${idx++}`);
      values.push(patch.resolutionNotes);
    }
    if (patch.resolvedBy !== undefined) {
      sets.push(`resolved_by = $${idx++}`);
      values.push(patch.resolvedBy);
    }
    if (patch.resolvedAt !== undefined) {
      sets.push(`resolved_at = $${idx++}`);
      values.push(patch.resolvedAt);
    }

    if (sets.length > 0) {
      values.push(id);
      await this.pool.query(`UPDATE initiative_dependencies SET ${sets.join(', ')} WHERE id = $${idx}`, values);
    }

    const updated = await this.dependencyById(id);
    if (!updated) throw new Error(`Dependencia no encontrada tras actualizar: ${id}`);
    return updated;
  }

  // --- Caja negra (append-only) ----------------------------------------------

  async listActivityLog(initiativeId?: string): Promise<ActivityLogEntry[]> {
    const query = initiativeId
      ? `SELECT 
          id, initiative_id, user_id, action_type, from_stage_id, to_stage_id,
          field_name, old_value, new_value, override_metadata, created_at
         FROM activity_log WHERE initiative_id = $1
         ORDER BY created_at ASC`
      : `SELECT 
          id, initiative_id, user_id, action_type, from_stage_id, to_stage_id,
          field_name, old_value, new_value, override_metadata, created_at
         FROM activity_log
         ORDER BY created_at ASC`;
    const params = initiativeId ? [initiativeId] : [];
    const res = await this.pool.query(query, params);
    return res.rows.map((r) => ({
      id: r.id,
      initiativeId: r.initiative_id ?? null,
      userId: r.user_id,
      actionType: r.action_type,
      fromStageId: r.from_stage_id ?? null,
      toStageId: r.to_stage_id ?? null,
      fieldName: r.field_name ?? null,
      oldValue: r.old_value ?? null,
      newValue: r.new_value ?? null,
      overrideMetadata: r.override_metadata ?? undefined,
      createdAt: toIso(r.created_at),
    }));
  }

  async appendActivityLog(entry: Omit<ActivityLogEntry, 'id'>): Promise<ActivityLogEntry> {
    const res = await this.pool.query(
      `INSERT INTO activity_log (
        initiative_id, user_id, action_type, from_stage_id, to_stage_id,
        field_name, old_value, new_value, override_metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10
      ) RETURNING id, created_at`,
      [
        entry.initiativeId,
        entry.userId,
        entry.actionType,
        entry.fromStageId,
        entry.toStageId,
        entry.fieldName,
        entry.oldValue ? JSON.stringify(entry.oldValue) : null,
        entry.newValue ? JSON.stringify(entry.newValue) : null,
        entry.overrideMetadata ? JSON.stringify(entry.overrideMetadata) : null,
        entry.createdAt ?? new Date().toISOString(),
      ],
    );
    const row = res.rows[0];
    return {
      ...entry,
      id: row.id,
      createdAt: toIso(row.created_at),
    };
  }

  // --- Mappers internos ------------------------------------------------------

  private mapUser(r: Record<string, unknown>): User {
    // pg no parsea arrays de ENUM: puede llegar como literal "{A,B}" en vez de array.
    const rawValue = r.departments;
    const rawDepts: string[] = Array.isArray(rawValue)
      ? (rawValue as string[])
      : typeof rawValue === 'string'
        ? rawValue
            .replace(/^\{|\}$/g, '')
            .split(',')
            .map((d) => d.trim().replace(/^"|"$/g, ''))
            .filter(Boolean)
        : [];
    return {
      id: String(r.id),
      name: String(r.name),
      email: String(r.email),
      role: r.role as UserRole,
      isActive: Boolean(r.is_active),
      isAnonymized: Boolean(r.is_anonymized),
      departments: rawDepts as Department[],
      createdAt: toIso(r.created_at),
    };
  }

  private mapStage(r: Record<string, unknown>): WorkflowStage {
    return {
      id: Number(r.id),
      key: r.key as StageKey,
      name: String(r.name),
      orderIndex: Number(r.order_index),
      defaultOwnerDepartment: r.default_owner_department as Department,
      sleHours: Number(r.sle_hours),
      wipLimit: Number(r.wip_limit),
      isActive: Boolean(r.is_active),
      purpose: String(r.purpose ?? ''),
    };
  }

  private mapChecklistItem(r: Record<string, unknown>): StageChecklistItem {
    return {
      id: String(r.id),
      stageId: Number(r.stage_id),
      label: String(r.label),
      description: r.description ? String(r.description) : null,
      orderIndex: Number(r.order_index),
      isMandatory: Boolean(r.is_mandatory),
      responsibleDepartment: r.responsible_department as Department,
      createdAt: toIso(r.created_at),
    };
  }

  private mapInitiative(r: Record<string, unknown>): Initiative {
    let parsedLinks = r.links;
    if (typeof parsedLinks === 'string') {
      try {
        parsedLinks = JSON.parse(parsedLinks);
      } catch {
        parsedLinks = [];
      }
    }

    return {
      id: String(r.id),
      title: String(r.title),
      description: String(r.description ?? ''),
      priority: r.priority as PriorityLevel,
      priorityReason: r.priority_reason as PriorityReason,
      currentStageId: Number(r.current_stage_id),
      ownerDepartment: r.owner_department as Department,
      currentAssigneeId: r.current_assignee_id ? String(r.current_assignee_id) : null,
      createdBy: String(r.created_by),
      isBlocked: Boolean(r.is_blocked),
      stopReason: (r.stop_reason as StopReason) ?? null,
      blockedDescription: r.blocked_description ? String(r.blocked_description) : null,
      manualStopReason: (r.manual_stop_reason as StopReason) ?? null,
      manualStopDescription: r.manual_stop_description ? String(r.manual_stop_description) : null,
      blockedSince: toNullableIso(r.blocked_since),
      blockedStartedAt: toNullableIso(r.blocked_started_at),
      blockedMsInStage: Number(r.blocked_ms_in_stage ?? 0),
      currentTask: r.current_task ? String(r.current_task) : null,
      links: Array.isArray(parsedLinks) ? (parsedLinks as Initiative['links']) : [],
      isArchived: Boolean(r.is_archived),
      stageEnteredAt: toIso(r.stage_entered_at),
      createdAt: toIso(r.created_at),
      updatedAt: toIso(r.updated_at),
    };
  }

  private mapDependency(r: Record<string, unknown>): Dependency {
    return {
      id: String(r.id),
      initiativeId: String(r.initiative_id),
      requestedBy: String(r.requested_by),
      targetDepartment: r.target_department as Department,
      helpType: r.help_type as HelpType,
      isBlocking: Boolean(r.is_blocking),
      description: String(r.description),
      checklistItemId: r.checklist_item_id ? String(r.checklist_item_id) : null,
      status: r.status as HelpStatus,
      resolutionNotes: r.resolution_notes ? String(r.resolution_notes) : null,
      resolvedBy: r.resolved_by ? String(r.resolved_by) : null,
      createdAt: toIso(r.created_at),
      resolvedAt: toNullableIso(r.resolved_at),
    };
  }
}
