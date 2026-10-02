import type { StageKey, UserRole } from './enums';
import { MIN_OVERRIDE_REASON, MIN_OVERRIDE_RISK } from './rules';

/**
 * Glosario de la interfaz: una sola fuente para las ayudas contextuales, la
 * guía de bienvenida y la página de ayuda, de modo que nunca se contradigan.
 * Textos visibles en español; identificadores en inglés.
 */

export const GLOSSARY_KEYS = [
  'sle',
  'wip',
  'gate',
  'dependency',
  'stop',
  'override',
  'priority',
  'flowState',
  'ownership',
] as const;
export type GlossaryKey = (typeof GLOSSARY_KEYS)[number];

export interface GlossaryTerm {
  title: string;
  /** Una frase, para la ayuda contextual. */
  short: string;
  /** Explicación completa, para la página de ayuda. */
  long: string;
}

export const GLOSSARY: Record<GlossaryKey, GlossaryTerm> = {
  sle: {
    title: 'SLE · objetivo de permanencia',
    short: 'El tiempo que debería pasar una iniciativa en esta fase. El tiempo en parada no cuenta.',
    long: 'El SLE es el tiempo objetivo que una iniciativa debería permanecer en una fase. Se mide en horas netas: mientras la iniciativa está parada, el reloj se pausa, así que esperar a otro departamento no te penaliza. El reloj pasa a amarillo («Riesgo») al llegar al 75 % del objetivo y a rojo («Objetivo excedido») al superarlo. Mide la salud del proceso, no el rendimiento de las personas.',
  },
  wip: {
    title: 'WIP · trabajo en curso',
    short: 'Cuántas iniciativas hay activas en la fase frente al cupo recomendado. Avisa, nunca impide mover nada.',
    long: 'El WIP es el número de iniciativas activas en una fase (por ejemplo 3/4: tres de un cupo recomendado de cuatro). Si se supera aparece «Saturado»: es un aviso para que el equipo se pregunte si está empezando demasiado a la vez. Nunca bloquea mover una iniciativa.',
  },
  gate: {
    title: 'Compuerta de salida',
    short: 'La lista de requisitos que hay que cerrar al 100 % para pasar a la siguiente fase.',
    long: 'Cada fase tiene una lista de requisitos de salida. Cada requisito lo marca el departamento responsable (Dirección puede marcar cualquiera). «Avanzar fase» solo funciona con la lista al 100 %. Si falta algo, la propia pantalla muestra lo pendiente y te deja pedírselo al departamento responsable en un clic, o solicitar un avance excepcional.',
  },
  dependency: {
    title: 'Dependencia 🆘',
    short: 'Una petición de ayuda a otro departamento. Pedirla no cambia quién es el dueño de la iniciativa.',
    long: 'Una dependencia es una petición de ayuda a otro departamento: información, validación, decisión o recursos. La iniciativa sigue siendo del departamento propietario (no hay «ping-pong»). Si marcas «bloquea totalmente», la iniciativa pasa a parada hasta que se resuelva; si no, sigue «avanzando en paralelo». El departamento destino la ve en Notificaciones y la resuelve o la rechaza con una nota.',
  },
  stop: {
    title: 'Parada ⛔',
    short: 'La iniciativa no puede avanzar por una causa concreta. Mientras dura, el reloj SLE está en pausa.',
    long: 'Una iniciativa se para cuando no puede avanzar: esperando una decisión, una validación o información, falta de capacidad, un bloqueo técnico o una causa externa. Se declara con su causa y una descripción. También se para sola cuando tiene una dependencia bloqueante abierta, y se reanuda al resolver la última. El tiempo en parada no cuenta contra el SLE.',
  },
  override: {
    title: 'Avance excepcional ⚠️',
    short: 'Pasar de fase sin completar la compuerta, con firma y motivo. Queda marcado para siempre.',
    long: `Es la salida de emergencia de la compuerta: solo un Responsable de área (en su área) o Dirección puede forzar el avance. Hay que indicar los requisitos pendientes, el motivo (mínimo ${MIN_OVERRIDE_REASON} caracteres), el riesgo que se asume (mínimo ${MIN_OVERRIDE_RISK}) y escribir CONFIRMAR EXCEPCION. Queda registrado con tu identidad, IP y navegador, y la tarjeta conserva una marca ⚠️ permanente.`,
  },
  priority: {
    title: 'Prioridad y motivo',
    short: 'Cuánta urgencia tiene la iniciativa y por qué. El motivo es obligatorio.',
    long: 'Toda iniciativa lleva una prioridad (Baja, Normal, Alta, Crítica) y un motivo (riesgo regulatorio, cliente B2B, incidencia de seguridad, hoja de ruta o mejora interna). El motivo evita que «Alta» signifique «lo pidió alguien fuerte». Solo la cambia el Responsable del área propietaria o Dirección.',
  },
  flowState: {
    title: 'Estado de flujo',
    short: '⛔ Parada: no avanza · 🟡 En paralelo: espera ayuda pero sigue · 🟢 Avanzando.',
    long: '⛔ Parada: la iniciativa no puede avanzar. 🟡 Avanzando en paralelo: hay una petición de ayuda abierta que no bloquea. 🟢 Avanzando: sin esperas.',
  },
  ownership: {
    title: 'Propiedad',
    short: 'Cada fase tiene un departamento dueño. Al avanzar, la propiedad cambia sola y queda sin asignar.',
    long: 'Cada fase tiene un departamento propietario por defecto. Al avanzar, la iniciativa pasa a ese departamento y queda sin persona asignada. Solo quien pertenece al departamento propietario (o Dirección) puede avanzar, asignar o parar. Reasignar la propiedad la hace un Responsable o Dirección y exige un motivo.',
  },
};

export const STAGE_GUIDE: Record<StageKey, string> = {
  IDEATION: 'Se formula la idea como unidad de valor: qué problema atiende y para quién.',
  FEASIBILITY: 'Se comprueba si es viable: riesgo regulatorio, clínico, técnico y económico.',
  CO_DESIGN: 'Los departamentos diseñan juntos la solución antes de construirla.',
  READY: 'Definición de «listo»: todo lo necesario para empezar a desarrollar está acordado.',
  DEV: 'Se construye. Tech lleva el trabajo, con ayuda de los demás cuando la pide.',
  QA: 'Se prueba y se prepara el entorno de staging antes de salir.',
  PROD: 'Está en producción: la iniciativa llega al usuario.',
};

export interface RoleGuide {
  title: string;
  can: string[];
}

export const ROLE_GUIDE: Record<UserRole, RoleGuide> = {
  MEMBER: {
    title: 'Miembro',
    can: [
      'Ver todo el tablero, el radar y las fichas.',
      'Marcar los requisitos que corresponden a tu departamento.',
      'Avanzar, asignar y parar las iniciativas que son de tu departamento.',
      'Pedir ayuda a otros departamentos y responder a las que te piden.',
    ],
  },
  LEAD: {
    title: 'Responsable de área',
    can: [
      'Todo lo de un Miembro.',
      'Cambiar la prioridad y reasignar la propiedad de las iniciativas de tu área.',
      'Autorizar un avance excepcional en tu área.',
      'Dar de alta a miembros dentro de tus áreas.',
    ],
  },
  EXECUTIVE: {
    title: 'Dirección',
    can: [
      'Todo lo anterior, sobre cualquier departamento.',
      'Ver el panel de dirección con la salud del flujo.',
      'Gestionar la lista de acceso y los parámetros de SLE y WIP de cada fase.',
    ],
  },
};
