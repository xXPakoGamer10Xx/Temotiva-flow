import { z } from 'zod';
import type { SessionContext } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { DomainError } from '@/server/services/errors';
import { MCP_TOOLS } from './tools';

/**
 * Servidor MCP sin estado sobre JSON-RPC 2.0 (transporte HTTP "streamable" en
 * modo respuesta JSON). Es una función pura sobre `store` y `session`: la
 * autenticación ocurre antes, en la ruta, y nada aquí toca la red.
 */

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
/** Una respuesta enorme no ayuda al modelo y cuesta contexto. */
const MAX_RESULT_CHARS = 100_000;

const requestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const rpcError = (id: string | number | null, code: number, message: string): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
});

const toolsList = MCP_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: z.toJSONSchema(tool.schema, { io: 'input' }),
  annotations: { readOnlyHint: true, openWorldHint: false },
}));

function textResult(text: string, isError = false) {
  return { content: [{ type: 'text', text }], isError };
}

async function callTool(store: DataStore, session: SessionContext, params: Record<string, unknown> | undefined) {
  const tool = MCP_TOOLS.find((candidate) => candidate.name === params?.name);
  if (!tool) return null;

  const parsed = tool.schema.safeParse(params?.arguments ?? {});
  if (!parsed.success) return textResult(parsed.error.issues[0]?.message ?? 'Argumentos no válidos.', true);

  try {
    const data = await tool.run({ store, session, args: parsed.data as never });
    const text = JSON.stringify(data, null, 2);
    return textResult(
      text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n… (recortado)` : text,
    );
  } catch (error) {
    if (error instanceof DomainError) return textResult(error.message, true);
    // Sin traza ni datos de sesión hacia el cliente (SEGURIDAD.md §8.5).
    console.error('[temotiva-flow] error inesperado en una herramienta MCP:', tool.name, error);
    return textResult('No se ha podido completar la operación.', true);
  }
}

/** Devuelve `null` para las notificaciones (no llevan respuesta). */
export async function handleMcpMessage(
  store: DataStore,
  session: SessionContext,
  message: unknown,
): Promise<JsonRpcResponse | null> {
  const parsed = requestSchema.safeParse(message);
  if (!parsed.success) return rpcError(null, -32600, 'Petición no válida.');

  const { id, method, params } = parsed.data;
  if (id === undefined) return null;

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      const version = SUPPORTED_VERSIONS.find((candidate) => candidate === requested) ?? SUPPORTED_VERSIONS[0];
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: version,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'temotiva-flow', version: '1.0.0' },
          instructions:
            'Consulta iniciativas de Temotiva Flow con los permisos de la persona dueña del token. Solo lectura.',
        },
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: toolsList } };
    case 'tools/call': {
      const result = await callTool(store, session, params);
      return result ? { jsonrpc: '2.0', id, result } : rpcError(id, -32602, 'Herramienta desconocida.');
    }
    default:
      return rpcError(id, -32601, 'Método no soportado.');
  }
}
