import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Cerebro de Temotiva en línea. El PNG oficial es negro sobre transparente, así
 * que en tema oscuro se invierte para que no desaparezca sobre el fondo.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn('grid shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2 ring-1 ring-border', className)}
    >
      <Image
        src="/brand/temotiva-brain.png"
        alt=""
        width={581}
        height={430}
        priority
        className="size-[135%] max-w-none object-contain dark:invert"
      />
    </span>
  );
}
