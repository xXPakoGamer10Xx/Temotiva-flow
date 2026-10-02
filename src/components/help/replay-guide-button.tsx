'use client';

import { openWelcomeGuide } from '@/components/command/command-bus';
import { Button } from '@/components/ui/button';

export function ReplayGuideButton() {
  return (
    <Button variant="outline" size="sm" onClick={openWelcomeGuide}>
      Ver la guía de bienvenida
    </Button>
  );
}
