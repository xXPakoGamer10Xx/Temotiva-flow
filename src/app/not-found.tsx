import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Página no encontrada' };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md space-y-4 text-center">
        <p className="font-mono text-[11px] text-fg-subtle">404</p>
        <p className="text-[15px] font-medium">No encontramos esta página</p>
        <p className="text-xs text-fg-muted">
          Puede que el enlace esté mal escrito o que ya no exista. Desde el tablero llegas a todo lo demás.
        </p>
        <Button asChild>
          <Link href="/board">Volver al tablero</Link>
        </Button>
      </div>
    </main>
  );
}
