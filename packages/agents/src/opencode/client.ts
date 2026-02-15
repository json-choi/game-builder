import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import { OPENCODE_BASE_URL } from "./config";

export type OpencodeClient = ReturnType<typeof createOpencodeClient>;

export interface SessionInfo {
  id: string;
  title: string;
}

export interface ImageAttachment {
  media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  data: string; // base64-encoded image data
}

export interface PromptOptions {
  sessionId: string;
  text: string;
  model?: { providerID: string; modelID: string };
  agent?: string;
  tools?: Record<string, boolean>;
  attachments?: ImageAttachment[];
}

export interface PromptResponse {
  text: string | null;
  parts: Array<{ type: string; [key: string]: unknown }>;
  raw: unknown;
}

export type SSEEvent = {
  type: string;
  properties: Record<string, unknown>;
};

let clientInstance: OpencodeClient | null = null;
let currentDirectory: string = process.cwd();

export function setDirectory(dir: string): void {
  if (dir !== currentDirectory) {
    currentDirectory = dir;
    clientInstance = null;
  }
}

export function getDirectory(): string {
  return currentDirectory;
}

export function getClient(): OpencodeClient {
  if (!clientInstance) {
    clientInstance = createOpencodeClient({
      baseUrl: OPENCODE_BASE_URL,
      directory: currentDirectory,
    });
  }
  return clientInstance;
}

export function resetClient(): void {
  clientInstance = null;
}

export async function createSession(title: string): Promise<SessionInfo> {
  const client = getClient();
  const result = await client.session.create({
    directory: currentDirectory,
    title,
  });

  if (!result.data?.id) {
    throw new Error("Failed to create session: no ID returned");
  }

  return {
    id: result.data.id,
    title: title,
  };
}

export async function listSessions(): Promise<SessionInfo[]> {
  const client = getClient();
  const result = await client.session.list({
    directory: currentDirectory,
  });

  if (!result.data) return [];

  return result.data.map((s: { id: string; title?: string }) => ({
    id: s.id,
    title: s.title ?? "Untitled",
  }));
}

export async function deleteSession(sessionId: string): Promise<void> {
  const client = getClient();
  await client.session.delete({
    sessionID: sessionId,
    directory: currentDirectory,
  });
}

function buildPromptParts(
  text: string,
  attachments?: ImageAttachment[]
): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];

  if (attachments && attachments.length > 0) {
    for (const img of attachments) {
      parts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.media_type,
          data: img.data,
        },
      });
    }
  }

  parts.push({ type: "text" as const, text });

  return parts;
}

export async function sendPrompt(options: PromptOptions): Promise<PromptResponse> {
  const client = getClient();

  const parts = buildPromptParts(options.text, options.attachments);

  const params: Parameters<typeof client.session.prompt>[0] = {
    sessionID: options.sessionId,
    directory: currentDirectory,
    parts: parts as Array<{ type: "text"; text: string }>,
  };

  if (options.model) {
    params.model = options.model;
  }
  if (options.agent) {
    params.agent = options.agent;
  }
  if (options.tools) {
    params.tools = options.tools;
  }

  const result = await client.session.prompt(params);

  const resultParts = (result.data?.parts as Array<{ type: string; [key: string]: unknown }>) ?? [];
  const textPart = resultParts.find((p) => p.type === "text");

  return {
    text: (textPart?.text as string) ?? null,
    parts: resultParts,
    raw: result.data,
  };
}

export async function sendPromptAsync(options: PromptOptions): Promise<void> {
  const client = getClient();

  const parts = buildPromptParts(options.text, options.attachments);

  const params: Parameters<typeof client.session.promptAsync>[0] = {
    sessionID: options.sessionId,
    directory: currentDirectory,
    parts: parts as Array<{ type: "text"; text: string }>,
  };

  if (options.model) {
    params.model = options.model;
  }
  if (options.agent) {
    params.agent = options.agent;
  }
  if (options.tools) {
    params.tools = options.tools;
  }

  await client.session.promptAsync(params);
}

export async function listAgents(): Promise<
  Array<{ name: string; [key: string]: unknown }>
> {
  const client = getClient();
  const result = await client.app.agents({
    directory: currentDirectory,
  });
  return (result.data as Array<{ name: string; [key: string]: unknown }>) ?? [];
}

export async function respondToPermission(
  _sessionId: string,
  permissionId: string,
  response: "once" | "always" | "reject" = "always"
): Promise<void> {
  const client = getClient();
  await client.permission.reply({
    requestID: permissionId,
    directory: currentDirectory,
    reply: response,
  });
}

export async function replyToQuestion(
  requestID: string,
  answers: Array<Array<string>>
): Promise<void> {
  const client = getClient();
  await client.question.reply({
    requestID,
    directory: currentDirectory,
    answers,
  });
}

export async function rejectQuestion(requestID: string): Promise<void> {
  const client = getClient();
  await client.question.reject({
    requestID,
    directory: currentDirectory,
  });
}

export async function subscribeEvents(): Promise<{
  stream: AsyncIterable<SSEEvent>;
}> {
  const client = getClient();
  const result = await client.event.subscribe({
    directory: currentDirectory,
  });

  return {
    stream: result.stream as AsyncIterable<SSEEvent>,
  };
}
