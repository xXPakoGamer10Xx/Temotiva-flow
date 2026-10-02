/** Atajos de teclado visibles: los lee el diálogo `?` y la página de ayuda. */
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'K'], label: 'Abrir la paleta de comandos' },
  { keys: ['C'], label: 'Nueva iniciativa' },
  { keys: ['/'], label: 'Filtrar el tablero' },
  { keys: ['G', 'B'], label: 'Ir al tablero' },
  { keys: ['G', 'R'], label: 'Ir al radar de esperas' },
  { keys: ['G', 'D'], label: 'Ir al panel de dirección' },
  { keys: ['G', 'N'], label: 'Ir a notificaciones' },
  { keys: ['G', 'A'], label: 'Ir al equipo (responsables y dirección)' },
  { keys: ['G', 'H'], label: 'Ir a la ayuda' },
  { keys: ['Esc'], label: 'Cerrar el panel o el diálogo abierto' },
  { keys: ['?'], label: 'Ver esta ayuda' },
];

