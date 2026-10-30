/**
 * Mensaje de error de una subida. Si el servidor respondió con JSON se usa su
 * mensaje; si no (p. ej. el hosting corta antes de llegar a la aplicación), el
 * código HTTP dice mucho más que un «inténtalo de nuevo» genérico.
 */
export async function uploadErrorMessage(response: Response, fallback: string): Promise<string> {
  const result = (await response.json().catch(() => null)) as { ok: boolean; message?: string } | null;
  if (result?.message) return result.message;
  if (response.status === 413) return 'El archivo es demasiado grande para el servidor (máximo 4 MB).';
  if (response.status === 401 || response.status === 307 || response.redirected) {
    return 'Tu sesión ha caducado. Vuelve a entrar e inténtalo de nuevo.';
  }
  if (response.status === 504 || response.status === 408) return 'La subida tardó demasiado. Prueba con un archivo más pequeño o con mejor conexión.';
  return `${fallback} (código ${response.status})`;
}

/** `true` si la respuesta fue una subida correcta. */
export async function isUploadOk(response: Response): Promise<boolean> {
  if (!response.ok) return false;
  const result = (await response.clone().json().catch(() => null)) as { ok: boolean } | null;
  return result?.ok === true;
}
