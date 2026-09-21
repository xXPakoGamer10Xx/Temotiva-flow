import type { StageChecklistItem, WorkflowStage } from './types';
import type { StageKey } from './enums';

/**
 * Las 7 fases secuenciales cerradas (TemoFlow.md §1.2) y sus compuertas de
 * salida. Es el estado inicial de `workflow_stages` y `stage_checklists`;
 * ambas tablas son configurables en caliente (LEAD sobre su área, EXECUTIVE
 * sobre WIP y SLE), por eso viven en el DataStore y no como constantes.
 *
 * Nota sobre el SLE: V1 mide horas naturales netas (descontando el tiempo en
 * parada). El calendario laborable real queda para V2, por eso "48 horas
 * laborables" se modela como 48 h de reloj neto.
 */
export const SEED_STAGES: WorkflowStage[] = [
  {
    id: 1,
    key: 'IDEATION',
    name: 'Ideación',
    orderIndex: 1,
    defaultOwnerDepartment: 'PRODUCT',
    sleHours: 168,
    wipLimit: 6,
    isActive: true,
    purpose:
      'Aterrizar el problema, la hipótesis clínica y la métrica de negocio en un Concept Brief de 1 página.',
  },
  {
    id: 2,
    key: 'FEASIBILITY',
    name: 'Viabilidad',
    orderIndex: 2,
    defaultOwnerDepartment: 'LEGAL',
    sleHours: 48,
    wipLimit: 4,
    isActive: true,
    purpose: 'Dictamen RGPD Art. 9, evaluación de impacto y factibilidad técnica y de costes preliminar.',
  },
  {
    id: 3,
    key: 'CO_DESIGN',
    name: 'Co-Diseño',
    orderIndex: 3,
    defaultOwnerDepartment: 'DESIGN',
    sleHours: 120,
    wipLimit: 4,
    isActive: true,
    purpose: 'Prototipado interactivo en Figma con microcopy real de Psicología y system prompts cerrados.',
  },
  {
    id: 4,
    key: 'READY',
    name: 'Ready (DoR)',
    orderIndex: 4,
    defaultOwnerDepartment: 'PRODUCT',
    sleHours: 72,
    wipLimit: 4,
    isActive: true,
    purpose:
      'Especificación técnica cerrada (OpenAPI), criterios de aceptación QA y estrategia de privacidad validada.',
  },
  {
    id: 5,
    key: 'DEV',
    name: 'Desarrollo',
    orderIndex: 5,
    defaultOwnerDepartment: 'TECH',
    sleHours: 240,
    wipLimit: 5,
    isActive: true,
    purpose: 'Construcción de código, tests unitarios en verde y despliegue automatizado en Staging.',
  },
  {
    id: 6,
    key: 'QA',
    name: 'QA & Staging',
    orderIndex: 6,
    defaultOwnerDepartment: 'QA',
    sleHours: 48,
    wipLimit: 3,
    isActive: true,
    purpose:
      'Regresión E2E, validación de flujos críticos de pago y salud y verificación de Ciberseguridad.',
  },
  {
    id: 7,
    key: 'PROD',
    name: 'Producción',
    orderIndex: 7,
    defaultOwnerDepartment: 'TECH',
    sleHours: 24,
    wipLimit: 5,
    isActive: true,
    purpose: 'Despliegue completado, verificación de sanidad en vivo y apertura a usuarios.',
  },
];

export const STAGE_ID_BY_KEY: Record<StageKey, number> = {
  IDEATION: 1,
  FEASIBILITY: 2,
  CO_DESIGN: 3,
  READY: 4,
  DEV: 5,
  QA: 6,
  PROD: 7,
};

const CHECKLIST_CREATED_AT = '2026-01-07T08:00:00.000Z';

type ChecklistSeedItem = Omit<StageChecklistItem, 'id' | 'stageId' | 'orderIndex' | 'createdAt'>;

const CHECKLIST_SEED: [StageKey, ChecklistSeedItem[]][] = [
  [
    'IDEATION',
    [
      {
        label: 'Concept Brief de 1 página redactado',
        description: 'Problema, enfoque clínico, comportamiento del sistema e impacto esperado.',
        isMandatory: true,
        responsibleDepartment: 'PRODUCT',
      },
      {
        label: 'Enfoque clínico y evidencia documentados',
        description: 'Metodología de respaldo (CBT, ACT, mindfulness, journaling estructurado…).',
        isMandatory: true,
        responsibleDepartment: 'PSYCHOLOGY',
      },
      {
        label: 'Líneas rojas clínicas definidas',
        description: 'Qué no debe hacer ni responder jamás el sistema o el asistente de IA.',
        isMandatory: true,
        responsibleDepartment: 'PSYCHOLOGY',
      },
      {
        label: 'Métrica de impacto y propuesta de valor B2B/B2C',
        description: 'Adopción, retención y encaje comercial esperado.',
        isMandatory: true,
        responsibleDepartment: 'PRODUCT',
      },
    ],
  ],
  [
    'FEASIBILITY',
    [
      {
        label: 'Dictamen RGPD Art. 9 y base de licitud',
        description: 'Tratamiento de datos de salud y consentimientos específicos requeridos.',
        isMandatory: true,
        responsibleDepartment: 'LEGAL',
      },
      {
        label: 'Clasificación MDR / SaMD resuelta',
        description: 'Determinar si la función es bienestar o roza criterios de producto sanitario.',
        isMandatory: true,
        responsibleDepartment: 'LEGAL',
      },
      {
        label: 'Estimación T-shirt y coste de inferencia',
        description: 'S/M/L/XL más coste estimado de llamadas a modelos de IA e infraestructura.',
        isMandatory: true,
        responsibleDepartment: 'TECH',
      },
      {
        label: 'Aislamiento multitenant y superficie de ataque revisados',
        description: 'Impacto sobre el aislamiento B2B en PostgreSQL y controles de seguridad.',
        isMandatory: true,
        responsibleDepartment: 'CYBER',
      },
    ],
  ],
  [
    'CO_DESIGN',
    [
      {
        label: 'Prototipo interactivo en Figma enlazado',
        description: 'Flujo navegable completo, no pantallas sueltas.',
        isMandatory: true,
        responsibleDepartment: 'DESIGN',
      },
      {
        label: 'Microcopy final provisto por Psicología',
        description: 'Sin textos provisionales: en salud mental el tono es el núcleo del producto.',
        isMandatory: true,
        responsibleDepartment: 'PSYCHOLOGY',
      },
      {
        label: 'System prompt del asistente cerrado',
        description: 'Árbol de respuestas, escalas y protocolo de derivación revisados.',
        isMandatory: true,
        responsibleDepartment: 'PSYCHOLOGY',
      },
      {
        label: 'Accesibilidad AA y patrones éticos verificados',
        description: 'Contraste, foco, lectores de pantalla y ausencia de patrones oscuros.',
        isMandatory: true,
        responsibleDepartment: 'DESIGN',
      },
      {
        label: 'Design Sign-off de Producto, Psicología y Legal',
        description: 'Firma conjunta del prototipo antes de pasar a Ready.',
        isMandatory: true,
        responsibleDepartment: 'PRODUCT',
      },
    ],
  ],
  [
    'READY',
    [
      {
        label: 'Contrato de API cerrado (OpenAPI)',
        description: 'Endpoints, esquemas y errores definidos y versionados.',
        isMandatory: true,
        responsibleDepartment: 'TECH',
      },
      {
        label: 'Criterios de aceptación QA aprobados',
        description: 'Casos de prueba y criterios de salida acordados con QA.',
        isMandatory: true,
        responsibleDepartment: 'QA',
      },
      {
        label: 'Estrategia de privacidad y anonimización validada',
        description: 'Persistencia, minimización y retención de datos sensibles acordadas.',
        isMandatory: true,
        responsibleDepartment: 'LEGAL',
      },
      {
        label: 'Protocolo de contingencia ante crisis definido',
        description: 'Qué hace el sistema ante señales de riesgo del usuario.',
        isMandatory: true,
        responsibleDepartment: 'PSYCHOLOGY',
      },
      {
        label: 'Definition of Ready firmada',
        description: 'Historias estimadas, sin ambigüedades y listas para sprint.',
        isMandatory: true,
        responsibleDepartment: 'PRODUCT',
      },
    ],
  ],
  [
    'DEV',
    [
      {
        label: 'Revisión de código completada',
        description: 'Pull requests aprobadas e integradas en la rama de release.',
        isMandatory: true,
        responsibleDepartment: 'TECH',
      },
      {
        label: 'Tests unitarios en verde',
        description: 'Cobertura acordada alcanzada y pipeline sin fallos.',
        isMandatory: true,
        responsibleDepartment: 'TECH',
      },
      {
        label: 'Despliegue automatizado a Staging verificado',
        description: 'Entorno de staging estable con la funcionalidad desplegada.',
        isMandatory: true,
        responsibleDepartment: 'TECH',
      },
      {
        label: 'Sin secretos ni PII/PHI en logs',
        description: 'Revisión de trazas y telemetría antes de exponer a QA.',
        isMandatory: true,
        responsibleDepartment: 'CYBER',
      },
    ],
  ],
  [
    'QA',
    [
      {
        label: 'Regresión E2E automatizada en verde',
        description: 'Suite completa ejecutada sobre staging.',
        isMandatory: true,
        responsibleDepartment: 'QA',
      },
      {
        label: 'Flujos críticos de pago y salud validados',
        description: 'Cobro, alta, consentimientos y rutas de contenido clínico.',
        isMandatory: true,
        responsibleDepartment: 'QA',
      },
      {
        label: 'Verificación de Ciberseguridad firmada',
        description: 'Sin logs PII/PHI, cabeceras y permisos revisados.',
        isMandatory: true,
        responsibleDepartment: 'CYBER',
      },
      {
        label: 'Validación clínica del comportamiento del asistente',
        description: 'Casos límite revisados por Psicología sobre el entorno real.',
        isMandatory: true,
        responsibleDepartment: 'PSYCHOLOGY',
      },
    ],
  ],
  [
    'PROD',
    [
      {
        label: 'Despliegue a producción completado',
        description: 'Release publicada y versionada.',
        isMandatory: true,
        responsibleDepartment: 'TECH',
      },
      {
        label: 'Verificación de sanidad en vivo',
        description: 'Smoke test de los flujos críticos con tráfico real.',
        isMandatory: true,
        responsibleDepartment: 'TECH',
      },
      {
        label: 'Monitorización y alertas activas',
        description: 'Métricas, errores y alertas conectadas al canal de guardia.',
        isMandatory: true,
        responsibleDepartment: 'TECH',
      },
      {
        label: 'Comunicación a negocio y soporte',
        description: 'Notas de versión y guion de soporte entregados.',
        isMandatory: true,
        responsibleDepartment: 'PRODUCT',
      },
    ],
  ],
];

/** Identificador estable y legible: `CHK-FEASIBILITY-2`. */
export function checklistItemId(stageKey: StageKey, orderIndex: number): string {
  return `CHK-${stageKey}-${orderIndex}`;
}

export const SEED_CHECKLIST_ITEMS: StageChecklistItem[] = CHECKLIST_SEED.flatMap(([stageKey, items]) =>
  items.map((item, index) => ({
    ...item,
    id: checklistItemId(stageKey, index + 1),
    stageId: STAGE_ID_BY_KEY[stageKey],
    orderIndex: index + 1,
    createdAt: CHECKLIST_CREATED_AT,
  })),
);
