/**
 * Errores de dominio. El `code` es estable para los tests y el `message` es el
 * texto que ve la persona usuaria (en español, AGENTS.md §4.1).
 *
 * SEGURIDAD.md §8.5: los mensajes nunca exponen trazas internas, identificadores
 * de sesión ni datos de otras personas.
 */
export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'GATE_INCOMPLETE'
  | 'INVALID_STATE';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export const notFound = (message: string): DomainError => new DomainError('NOT_FOUND', message);
export const forbidden = (message: string): DomainError => new DomainError('FORBIDDEN', message);
export const invalid = (message: string): DomainError => new DomainError('VALIDATION', message);
export const invalidState = (message: string): DomainError => new DomainError('INVALID_STATE', message);
