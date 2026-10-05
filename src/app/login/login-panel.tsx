'use client';

import * as React from 'react';
import { AlertTriangle, LogIn } from 'lucide-react';
import { devSignInAction, signInWithGoogleAction } from '@/server/actions/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Separator } from '@/components/ui/primitives';

export interface DevProfile {
  email: string;
  name: string;
  description: string;
}

/**
 * Panel de acceso. El camino real es SSO de Google contra la allowlist; el
 * bloque de desarrollo solo se renderiza si el servidor lo habilitó, y su
 * propio `authorize` vuelve a comprobar la allowlist antes de dar sesión.
 */
export function LoginPanel({
  googleConfigured,
  devAuthEnabled,
  devProfiles,
  authError,
}: {
  googleConfigured: boolean;
  devAuthEnabled: boolean;
  devProfiles: DevProfile[];
  authError?: string | null;
}) {
  const [email, setEmail] = React.useState(devProfiles[0]?.email ?? '');
  const [error, setError] = React.useState<string | null>(authError ?? null);
  const [isPending, startTransition] = React.useTransition();

  const enterAsDev = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await devSignInAction(email);
      if (result && !result.ok) setError(result.message);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Iniciar sesión</CardTitle>
        <CardDescription>Acceso por cuenta de Google verificada contra la lista de acceso.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {googleConfigured ? (
          <form action={signInWithGoogleAction}>
            <Button type="submit" className="w-full" size="lg">
              <LogIn className="size-4" />
              Continuar con Google
            </Button>
          </form>
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-border tone-warning px-3 py-2 text-xs text-[var(--warning)]">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Google OAuth todavía no está configurado. Añade <code className="font-mono">AUTH_GOOGLE_ID</code> y{' '}
              <code className="font-mono">AUTH_GOOGLE_SECRET</code> a <code className="font-mono">.env.local</code> para
              activarlo.
            </span>
          </div>
        )}

        {devAuthEnabled ? (
          <>
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs uppercase tracking-wide text-fg-muted">Solo desarrollo</span>
              <Separator className="flex-1" />
            </div>

            <div className="space-y-2">
              <Select
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-label="Perfil de desarrollo"
              >
                {devProfiles.map((profile) => (
                  <option key={profile.email} value={profile.email}>
                    {profile.name} — {profile.description}
                  </option>
                ))}
              </Select>
              <Button variant="outline" className="w-full" onClick={enterAsDev} disabled={isPending || !email}>
                {isPending ? 'Entrando…' : 'Entrar con este perfil'}
              </Button>
              <p className="text-xs text-fg-muted">
                Este atajo existe porque <code className="font-mono">ALLOW_DEV_AUTH=true</code> en un entorno de
                desarrollo. En producción no se registra nunca, y aun aquí solo entran perfiles activos de la lista de
                acceso.
              </p>
            </div>
          </>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-md tone-danger px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
