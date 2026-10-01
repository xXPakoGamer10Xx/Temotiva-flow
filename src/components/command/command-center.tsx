'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import {
  Bell,
  CornerDownLeft,
  KanbanSquare,
  Moon,
  Plus,
  Radar,
  Search,
  ShieldCheck,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import type { Department } from '@/domain/enums';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge, Kbd, SectionLabel } from '@/components/ui/primitives';
import { DepartmentDot } from '@/components/shared/signals';
import { cn } from '@/lib/utils';
import {
  UI_EVENTS,
  focusBoardFilter,
  isTypingTarget,
  openNewInitiative,
  openShortcutsHelp,
  useUiEvent,
} from './command-bus';

export interface PaletteInitiative {
  id: string;
  title: string;
  stageName: string;
  ownerDepartment: Department;
  isBlocked: boolean;
}

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: 'Iniciativas' | 'Ir a' | 'Acciones';
  icon?: React.ReactNode;
  keywords?: string;
  run: () => void;
}

/** Quita acentos y mayúsculas: buscar "codiseno" tiene que encontrar "Co-Diseño". */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Paleta de comandos (⌘K) y atajos globales.
 *
 * Es la capa que convierte el tablero en herramienta de uso diario: saltar a
 * una iniciativa por su ID, cambiar de vista o abrir un alta sin tocar el ratón.
 */
export function CommandCenter({
  initiatives,
  canManagePeople,
}: {
  initiatives: PaletteInitiative[];
  canManagePeople: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  useUiEvent(UI_EVENTS.openPalette, () => setOpen(true));
  useUiEvent(UI_EVENTS.openShortcuts, () => setShortcutsOpen(true));

  const go = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href as Route);
    },
    [router],
  );

  const commands = React.useMemo<Command[]>(() => {
    const views: Command[] = [
      {
        id: 'go-board',
        label: 'Tablero de flujo',
        hint: 'G B',
        group: 'Ir a',
        icon: <KanbanSquare className="size-3.5" />,
        run: () => go('/board'),
      },
      {
        id: 'go-radar',
        label: 'Radar de esperas',
        hint: 'G R',
        group: 'Ir a',
        icon: <Radar className="size-3.5" />,
        run: () => go('/radar'),
      },
      {
        id: 'go-executive',
        label: 'Panel de dirección',
        hint: 'G D',
        group: 'Ir a',
        icon: <TrendingUp className="size-3.5" />,
        run: () => go('/executive'),
      },
      {
        id: 'go-notifications',
        label: 'Notificaciones',
        hint: 'G N',
        group: 'Ir a',
        icon: <Bell className="size-3.5" />,
        run: () => go('/notifications'),
      },
    ];

    views.push({
      id: 'go-account',
      label: 'Mi cuenta',
      group: 'Ir a',
      icon: <UserRound className="size-3.5" />,
      keywords: 'perfil nombre contraseña',
      run: () => go('/cuenta'),
    });

    if (canManagePeople) {
      views.push({
        id: 'go-team',
        label: 'Equipo y accesos',
        hint: 'G A',
        group: 'Ir a',
        icon: <ShieldCheck className="size-3.5" />,
        keywords: 'personas usuarios altas',
        run: () => go('/team'),
      });
    }

    const actions: Command[] = [
      {
        id: 'new-initiative',
        label: 'Nueva iniciativa',
        hint: 'C',
        group: 'Acciones',
        icon: <Plus className="size-3.5" />,
        keywords: 'crear alta',
        run: () => {
          setOpen(false);
          if (pathname !== '/board') router.push('/board');
          // Deja que la vista monte antes de pedirle que abra el formulario.
          window.setTimeout(openNewInitiative, pathname === '/board' ? 0 : 350);
        },
      },
      {
        id: 'toggle-theme',
        label: 'Cambiar el tema claro u oscuro',
        group: 'Acciones',
        icon: <Moon className="size-3.5" />,
        keywords: 'modo oscuro claro tema',
        run: () => {
          const next = !document.documentElement.classList.contains('dark');
          document.documentElement.classList.toggle('dark', next);
          try {
            localStorage.setItem('temotiva-theme', next ? 'dark' : 'light');
          } catch {
            // Almacenamiento bloqueado: el tema dura la sesión.
          }
          setOpen(false);
        },
      },
      {
        id: 'shortcuts',
        label: 'Ver los atajos de teclado',
        hint: '?',
        group: 'Acciones',
        icon: <CornerDownLeft className="size-3.5" />,
        keywords: 'ayuda teclado',
        run: () => {
          setOpen(false);
          setShortcutsOpen(true);
        },
      },
    ];

    const initiativeCommands: Command[] = initiatives.map((initiative) => ({
      id: `initiative-${initiative.id}`,
      label: initiative.title,
      hint: initiative.id,
      group: 'Iniciativas',
      icon: <DepartmentDot department={initiative.ownerDepartment} />,
      keywords: `${initiative.id} ${initiative.stageName} ${DEPARTMENT_LABELS[initiative.ownerDepartment]}`,
      run: () => {
        // Se conservan los filtros que ya hubiera puestos: abrir una ficha desde
        // la paleta no debería reescribir la vista que tienes montada.
        const next = new URLSearchParams(searchParams.toString());
        next.set('iniciativa', initiative.id);
        go(`${pathname === '/' ? '/board' : pathname}?${next.toString()}`);
      },
    }));

    return [...initiativeCommands, ...views, ...actions];
  }, [canManagePeople, go, initiatives, pathname, router, searchParams]);

  const results = React.useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return commands.slice(0, 40);
    return commands
      .filter((command) => normalize(`${command.label} ${command.hint ?? ''} ${command.keywords ?? ''}`).includes(needle))
      .slice(0, 40);
  }, [commands, query]);

  const safeIndex = Math.min(activeIndex, Math.max(0, results.length - 1));

  // --- Atajos globales -------------------------------------------------------
  React.useEffect(() => {
    let pendingGo = 0;

    const onKeyDown = (event: KeyboardEvent): void => {
      const isPaletteCombo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isPaletteCombo) {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();

      if (Date.now() - pendingGo < 1200) {
        const destination = { b: '/board', r: '/radar', d: '/executive', n: '/notifications', a: '/team' }[key];
        pendingGo = 0;
        if (destination && (destination !== '/team' || canManagePeople)) {
          event.preventDefault();
          router.push(destination as Route);
          return;
        }
      }

      if (key === 'g') {
        pendingGo = Date.now();
        return;
      }
      if (key === 'c') {
        event.preventDefault();
        openNewInitiative();
        return;
      }
      if (key === '/') {
        event.preventDefault();
        focusBoardFilter();
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        openShortcutsHelp();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canManagePeople, router]);

  const onListKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % Math.max(1, results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + results.length) % Math.max(1, results.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      results[safeIndex]?.run();
    }
  };

  let lastGroup = '';

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setQuery('');
            setActiveIndex(0);
          }
        }}
      >
        <DialogContent hideClose className="top-[16%] w-[min(34rem,calc(100vw-2rem))] translate-y-0 p-0">
          <DialogTitle className="sr-only">Paleta de comandos</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border px-3.5">
            <Search className="size-4 shrink-0 text-fg-subtle" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onListKeyDown}
              placeholder="Busca una iniciativa, una vista o una acción…"
              aria-label="Buscar"
              className="h-11 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle"
            />
            <Kbd>Esc</Kbd>
          </div>

          <div ref={listRef} className="scrollbar-slim max-h-80 overflow-y-auto p-1.5">
            {results.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-fg-muted">Nada coincide con «{query}».</p>
            ) : (
              results.map((command, index) => {
                const showGroup = command.group !== lastGroup;
                lastGroup = command.group;

                return (
                  <React.Fragment key={command.id}>
                    {showGroup ? <SectionLabel className="px-2 pb-1 pt-2">{command.group}</SectionLabel> : null}
                    <button
                      type="button"
                      onClick={command.run}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                        index === safeIndex ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:bg-surface-2/60',
                      )}
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center text-fg-subtle">
                        {command.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{command.label}</span>
                      {command.hint ? (
                        <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{command.hint}</span>
                      ) : null}
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-border px-3.5 py-2 text-[11px] text-fg-subtle">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> moverse
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> abrir
            </span>
            <span className="ml-auto flex items-center gap-1">
              <Kbd>?</Kbd> atajos
            </span>
          </div>
        </DialogContent>
      </Dialog>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'K'], label: 'Abrir la paleta de comandos' },
  { keys: ['C'], label: 'Nueva iniciativa' },
  { keys: ['/'], label: 'Filtrar el tablero' },
  { keys: ['G', 'B'], label: 'Ir al tablero' },
  { keys: ['G', 'R'], label: 'Ir al radar de esperas' },
  { keys: ['G', 'D'], label: 'Ir al panel de dirección' },
  { keys: ['G', 'N'], label: 'Ir a notificaciones' },
  { keys: ['Esc'], label: 'Cerrar el panel o el diálogo abierto' },
  { keys: ['?'], label: 'Ver esta ayuda' },
];

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(26rem,calc(100vw-2rem))]">
        <div className="border-b border-border px-5 py-3.5">
          <DialogTitle>Atajos de teclado</DialogTitle>
        </div>
        <div className="p-2">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.label}
              className="flex items-center justify-between gap-4 rounded-md px-3 py-1.5 text-[13px]"
            >
              <span className="text-fg-muted">{shortcut.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {shortcut.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-border px-5 py-2.5">
          <Badge tone="neutral">Los atajos de una tecla se desactivan mientras escribes en un campo</Badge>
        </div>
      </DialogContent>
    </Dialog>
  );
}
