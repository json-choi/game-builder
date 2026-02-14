import { createOpencodeClient } from "@opencode-ai/sdk";
import { OPENCODE_BASE_URL } from "./config";

export type OpencodeClient = ReturnType<typeof createOpencodeClient>;

export interface SessionInfo {
  id: string;
  title: string;
}

export interface PromptOptions {
  sessionId: string;
  text: string;
  model?: { providerID: string; modelID: string };
  agent?: string;
  tools?: Record<string, boolean>;
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

function dirQuery() {
  return { query: { directory: currentDirectory } };
}

export async function createSession(title: string): Promise<SessionInfo> {
  const client = getClient();
  const result = await client.session.create({
    ...dirQuery(),
    body: { title },
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
  const result = await client.session.list(dirQuery());

  if (!result.data) return [];

  return result.data.map((s: { id: string; title?: string }) => ({
    id: s.id,
    title: s.title ?? "Untitled",
  }));
}

export async function deleteSession(sessionId: string): Promise<void> {
  const client = getClient();
  await client.session.delete({
    ...dirQuery(),
    path: { id: sessionId },
  });
}

export async function sendPrompt(options: PromptOptions): Promise<PromptResponse> {
  const client = getClient();

  const body: Record<string, unknown> = {
    parts: [{ type: "text" as const, text: options.text }],
  };

  if (options.model) {
    body.model = options.model;
  }
  if (options.agent) {
    body.agent = options.agent;
  }
  if (options.tools) {
    body.tools = options.tools;
  }

  const result = await client.session.prompt({
    ...dirQuery(),
    path: { id: options.sessionId },
    body: body as Parameters<typeof client.session.prompt>[0]["body"],
  });

  const parts = (result.data?.parts as Array<{ type: string; [key: string]: unknown }>) ?? [];
  const textPart = parts.find((p) => p.type === "text");

  return {
    text: (textPart?.text as string) ?? null,
    parts,
    raw: result.data,
  };
}

export async function sendPromptAsync(options: PromptOptions): Promise<void> {
  const client = getClient();

  const body: Record<string, unknown> = {
    parts: [{ type: "text" as const, text: options.text }],
  };

  if (options.model) {
    body.model = options.model;
  }
  if (options.agent) {
    body.agent = options.agent;
  }
  if (options.tools) {
    body.tools = options.tools;
  }

  await client.session.promptAsync({
    ...dirQuery(),
    path: { id: options.sessionId },
    body: body as Parameters<typeof client.session.promptAsync>[0]["body"],
  });
}

export async function listAgents(): Promise<
  Array<{ name: string; [key: string]: unknown }>
> {
  const client = getClient();
  const result = await client.app.agents(dirQuery());
  return (result.data as Array<{ name: string; [key: string]: unknown }>) ?? [];
}

export async function respondToPermission(
  sessionId: string,
  permissionId: string,
  response: "once" | "always" | "reject" = "always"
): Promise<void> {
  const client = getClient();
  await client.postSessionIdPermissionsPermissionId({
    ...dirQuery(),
    path: { id: sessionId, permissionID: permissionId },
    body: { response },
  });
}

export async function replyToQuestion(
  requestID: string,
  answers: Array<Array<string>>
): Promise<void> {
  const client = getClient();
  await client.question.reply({
    requestID,
    ...dirQuery(),
    answers,
  });
}

export async function rejectQuestion(requestID: string): Promise<void> {
  const client = getClient();
  await client.question.reject({
    requestID,
    ...dirQuery(),
  });
}

export async function subscribeEvents(): Promise<{
  stream: AsyncIterable<SSEEvent>;
}> {
  const client = getClient();
  const result = await client.event.subscribe(dirQuery());

  return {
    stream: result.stream as AsyncIterable<SSEEvent>,
  };
}
