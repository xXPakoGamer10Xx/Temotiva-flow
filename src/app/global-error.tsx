'use client';

/** Último recurso: falla el propio marco de la aplicación, así que no depende de sus estilos ni componentes. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', minHeight: '100dvh', placeItems: 'center' }}>
        <div style={{ maxWidth: 420, textAlign: 'center', padding: 16 }}>
          <p style={{ fontSize: 16, fontWeight: 500 }}>Temotiva Flow no ha podido cargar</p>
          <p style={{ fontSize: 13, color: '#666' }}>Recarga la página. Tus datos no se han perdido.</p>
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: '8px 14px', cursor: 'pointer' }}>
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
