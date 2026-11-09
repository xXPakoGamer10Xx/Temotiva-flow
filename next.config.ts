import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
  typescript: { ignoreBuildErrors: false },
  // En `next dev`, Next 16 escribe en consola los argumentos de cada Server Action:
  // títulos y descripciones del buzón, endpoints y claves de push… (SEGURIDAD.md:
  // nada de PII/PHI en logs). En producción no se registran; aquí tampoco.
  logging: { serverFunctions: false },
};

export default nextConfig;
