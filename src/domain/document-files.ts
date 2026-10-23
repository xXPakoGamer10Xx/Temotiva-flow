/**
 * Reglas de archivo de la biblioteca de documentos, sin dependencias de
 * servidor para que el formulario del cliente y el servicio usen la misma lista.
 *
 * Se admite casi cualquier archivo; solo se rechazan los ejecutables y scripts.
 */

export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

export const DOCUMENT_BLOCKED_ERROR = 'No se admiten archivos ejecutables ni scripts (.exe, .bat, .sh…).';

const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'msi', 'msp', 'scr', 'pif', 'cpl', 'dll', 'sys', 'drv', 'ocx',
  'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'mjs', 'cjs', 'wsf', 'wsh', 'ws', 'hta', 'msc', 'gadget',
  'inf', 'reg', 'lnk', 'scf', 'url',
  'sh', 'bash', 'zsh', 'command', 'run', 'bin', 'elf', 'so', 'dylib', 'out',
  'app', 'dmg', 'pkg', 'apk', 'ipa', 'deb', 'rpm', 'appx', 'msix', 'jar', 'class',
  'py', 'pl', 'rb', 'php',
]);

/** Tipos que se pueden anunciar con su MIME; cualquier otro se sirve como binario opaco. */
const SAFE_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
  csv: 'text/csv',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  zip: 'application/zip',
};

export const OPAQUE_MIME = 'application/octet-stream';

/** Extensión en minúsculas sin punto; cadena vacía si no tiene. */
export function fileExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index < 0 ? '' : fileName.slice(index + 1).toLowerCase();
}

/** Bloquea por cualquier tramo de la extensión: así también cae `informe.exe.pdf`. */
export function hasBlockedExtension(fileName: string): boolean {
  return fileName
    .toLowerCase()
    .split('.')
    .slice(1)
    .some((part) => BLOCKED_EXTENSIONS.has(part.trim()));
}

export function documentMimeFor(fileName: string): string {
  return SAFE_MIME_BY_EXTENSION[fileExtension(fileName)] ?? OPAQUE_MIME;
}

/** Cabeceras de binarios ejecutables: PE (MZ), ELF, Mach-O y script con shebang. */
export function looksExecutable(bytes: Uint8Array): boolean {
  const startsWith = (...signature: number[]): boolean => signature.every((byte, index) => bytes[index] === byte);
  return (
    startsWith(0x4d, 0x5a) ||
    startsWith(0x7f, 0x45, 0x4c, 0x46) ||
    startsWith(0xfe, 0xed, 0xfa, 0xce) ||
    startsWith(0xfe, 0xed, 0xfa, 0xcf) ||
    startsWith(0xce, 0xfa, 0xed, 0xfe) ||
    startsWith(0xcf, 0xfa, 0xed, 0xfe) ||
    startsWith(0xca, 0xfe, 0xba, 0xbe) ||
    startsWith(0x23, 0x21)
  );
}

/** Revisión rápida en el navegador; el servidor la repite con los bytes. */
export function checkDocumentFile(file: { name: string; size: number }): string | null {
  if (hasBlockedExtension(file.name)) return DOCUMENT_BLOCKED_ERROR;
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_DOCUMENT_BYTES) return 'El archivo supera 4 MB.';
  return null;
}
