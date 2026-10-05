import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { buildSeedData } from '../src/domain/seed';
import type { Department } from '../src/domain/enums';

/**
 * Inicialización de la base de datos PostgreSQL (Vercel / producción).
 *
 *   npm run db:setup -- --admin=tu-correo@gmail.com
 *
 * Por defecto SOLO crea el esquema, las fases, los items de compuerta y la
 * persona administradora inicial: nada de personas ni iniciativas ficticias
 * (SEGURIDAD.md §9.4 y §11: no se puebla un entorno accesible por red con
 * datos de demostración, y la lista de acceso solo debe contener personas reales).
 *
 * `--demo` añade además la semilla ficticia completa, solo para bases de pruebas.
 */

const envLocalPath = join(process.cwd(), '.env.local');
if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('\n❌ ERROR: DATABASE_URL no está definida.');
  console.error('Defínela en .env.local o pásala al comando:\n');
  console.error('DATABASE_URL="postgres://..." npm run db:setup -- --admin=tu-correo@gmail.com\n');
  process.exit(1);
}

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const pool = new Pool({
  connectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Los identificadores legibles de la semilla (`CHK-DEV-4`, `DEP-0001`,
 * `LOG-0001`) no son UUID, pero el DDL los exige. Se derivan de forma
 * determinista para que las referencias entre tablas sigan casando.
 */
function toUuid(id: string): string {
  if (UUID_RE.test(id)) return id;
  const h = createHash('sha1').update(`temotiva-flow:${id}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const orNull = (id: string | null): string | null => (id ? toUuid(id) : null);

const ALL_DEPARTMENTS: Department[] = [
  'PRODUCT',
  'PSYCHOLOGY',
  'LEGAL',
  'DESIGN',
  'TECH',
  'QA',
  'CYBER',
  'HR',
  'FINANCE',
  'MARKETING',
];

async function run(): Promise<void> {
  const client = await pool.connect();
  console.log('\n🚀 Conectado a PostgreSQL...');

  const demo = process.argv.includes('--demo');
  const adminArg = process.argv.find((a) => a.startsWith('--admin='));
  const adminEmail = (adminArg ? adminArg.split('=')[1] : process.env.INITIAL_ADMIN_EMAIL)?.trim().toLowerCase();

  if (!adminEmail && !demo) {
    console.error('\n❌ Falta el correo del administrador inicial: sin él nadie podría entrar.');
    console.error('Usa: npm run db:setup -- --admin=tu-correo@gmail.com\n');
    client.release();
    await pool.end();
    process.exit(1);
  }

  try {
    const checkTable = await client.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'initiatives') AS exists`,
    );

    if (!checkTable.rows[0]?.exists) {
      console.log('📦 Aplicando esquema desde db/01-schema.sql...');
      await client.query(readFileSync(join(process.cwd(), 'db', '01-schema.sql'), 'utf8'));
      console.log('✅ Esquema aplicado.');
    } else {
      console.log('ℹ️ Las tablas ya existen.');
    }

    const seed = buildSeedData();
    const stageCount = Number((await client.query('SELECT COUNT(*)::int AS c FROM workflow_stages')).rows[0].c);

    await client.query('BEGIN');

    if (stageCount === 0) {
      console.log('🌱 Sembrando fases y compuertas...');
      for (const stage of seed.stages) {
        await client.query(
          `INSERT INTO workflow_stages (id, key, name, order_index, default_owner_department, sle_hours, wip_limit, is_active, purpose)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING`,
          [stage.id, stage.key, stage.name, stage.orderIndex, stage.defaultOwnerDepartment, stage.sleHours, stage.wipLimit, stage.isActive, stage.purpose],
        );
      }
      // Mantiene la secuencia SERIAL por delante de los ids explícitos.
      await client.query(`SELECT setval(pg_get_serial_sequence('workflow_stages', 'id'), (SELECT MAX(id) FROM workflow_stages))`);

      for (const item of seed.checklistItems) {
        await client.query(
          `INSERT INTO stage_checklists (id, stage_id, label, description, order_index, is_mandatory, responsible_department, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
          [toUuid(item.id), item.stageId, item.label, item.description, item.orderIndex, item.isMandatory, item.responsibleDepartment, item.createdAt],
        );
      }
    } else {
      console.log('ℹ️ Las fases ya estaban sembradas.');
    }

    if (demo) {
      console.log('🧪 Modo --demo: insertando personas e iniciativas FICTICIAS...');
      for (const user of seed.users) {
        await client.query(
          `INSERT INTO users (id, name, email, role, is_active, is_anonymized, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
          [user.id, user.name, user.email, user.role, user.isActive, user.isAnonymized, user.createdAt],
        );
        for (const dept of user.departments) {
          await client.query(`INSERT INTO user_departments (user_id, department) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.id, dept]);
        }
      }

      for (const init of seed.initiatives) {
        await client.query(
          `INSERT INTO initiatives (
            id, title, description, priority, priority_reason, current_stage_id, owner_department,
            current_assignee_id, created_by, is_blocked, stop_reason, blocked_description,
            manual_stop_reason, manual_stop_description, blocked_since, blocked_started_at,
            blocked_ms_in_stage, current_task, links, is_archived, stage_entered_at, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
          ON CONFLICT (id) DO NOTHING`,
          [
            init.id, init.title, init.description, init.priority, init.priorityReason, init.currentStageId,
            init.ownerDepartment, init.currentAssigneeId, init.createdBy, init.isBlocked, init.stopReason,
            init.blockedDescription, init.manualStopReason, init.manualStopDescription, init.blockedSince,
            init.blockedStartedAt, init.blockedMsInStage, init.currentTask, JSON.stringify(init.links ?? []),
            init.isArchived, init.stageEnteredAt, init.createdAt, init.updatedAt,
          ],
        );
      }

      for (const val of seed.checklistValues) {
        await client.query(
          `INSERT INTO initiative_checklist_values (initiative_id, checklist_id, is_completed, completed_by, completed_at)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [val.initiativeId, toUuid(val.checklistId), val.isCompleted, val.completedBy, val.completedAt],
        );
      }

      for (const dep of seed.dependencies) {
        await client.query(
          `INSERT INTO initiative_dependencies (
            id, initiative_id, requested_by, target_department, help_type, is_blocking, description,
            checklist_item_id, status, resolution_notes, resolved_by, created_at, resolved_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO NOTHING`,
          [
            toUuid(dep.id), dep.initiativeId, dep.requestedBy, dep.targetDepartment, dep.helpType, dep.isBlocking,
            dep.description, orNull(dep.checklistItemId), dep.status, dep.resolutionNotes, dep.resolvedBy,
            dep.createdAt, dep.resolvedAt,
          ],
        );
      }

      for (const entry of seed.activityLog) {
        await client.query(
          `INSERT INTO activity_log (
            id, initiative_id, user_id, action_type, from_stage_id, to_stage_id,
            field_name, old_value, new_value, override_metadata, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
          [
            toUuid(entry.id), entry.initiativeId, entry.userId, entry.actionType, entry.fromStageId, entry.toStageId,
            entry.fieldName, entry.oldValue != null ? JSON.stringify(entry.oldValue) : null,
            entry.newValue != null ? JSON.stringify(entry.newValue) : null,
            entry.overrideMetadata ? JSON.stringify(entry.overrideMetadata) : null, entry.createdAt,
          ],
        );
      }
    }

    if (adminEmail) {
      console.log(`🔑 Registrando administrador inicial (${adminEmail})...`);
      const existing = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [adminEmail]);
      let id: string;
      if (existing.rows.length === 0) {
        id = randomUUID();
        await client.query(
          `INSERT INTO users (id, name, email, role, is_active, is_anonymized, created_at)
           VALUES ($1, $2, $3, 'EXECUTIVE', true, false, NOW())`,
          [id, 'Administración', adminEmail],
        );
      } else {
        id = existing.rows[0].id;
        await client.query(`UPDATE users SET role = 'EXECUTIVE', is_active = true WHERE id = $1`, [id]);
      }
      for (const dept of ALL_DEPARTMENTS) {
        await client.query(`INSERT INTO user_departments (user_id, department) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, dept]);
      }
    }

    await client.query('COMMIT');
    console.log('\n🎉 Inicialización completada.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('❌ Error durante la inicialización:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
