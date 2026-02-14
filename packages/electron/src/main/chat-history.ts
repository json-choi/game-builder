import initSqlJs, { type Database } from 'sql.js'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { app } from 'electron'
import { randomUUID } from 'node:crypto'

export interface ChatMessage {
  id: string
  projectId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  metadata?: string
}

let db: Database | null = null
let dbPath: string = ''

function getDbPath(): string {
  if (!dbPath) {
    const dir = join(app.getPath('userData'), 'data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    dbPath = join(dir, 'chat-history.db')
  }
  return dbPath
}

function persistDb(): void {
  if (db) {
    const data = db.export()
    writeFileSync(getDbPath(), Buffer.from(data))
  }
}

export async function initChatDb(): Promise<void> {
  const SQL = await initSqlJs()
  const path = getDbPath()

  if (existsSync(path)) {
    const buffer = readFileSync(path)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT
    )
  `)

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_project_timestamp
    ON messages (projectId, timestamp)
  `)

  persistDb()
}

function ensureDb(): Database {
  if (!db) throw new Error('Chat database not initialized. Call initChatDb() first.')
  return db
}

export function saveMessage(msg: Omit<ChatMessage, 'id'>): string {
  const database = ensureDb()
  const id = randomUUID()
  database.run(
    'INSERT INTO messages (id, projectId, role, content, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)',
    [id, msg.projectId, msg.role, msg.content, msg.timestamp, msg.metadata ?? null]
  )
  persistDb()
  return id
}

export function getMessages(projectId: string, limit?: number, offset?: number): ChatMessage[] {
  const database = ensureDb()
  const effectiveLimit = limit ?? 100
  const effectiveOffset = offset ?? 0
  const stmt = database.prepare(
    'SELECT id, projectId, role, content, timestamp, metadata FROM messages WHERE projectId = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?'
  )
  stmt.bind([projectId, effectiveLimit, effectiveOffset])

  const results: ChatMessage[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown as ChatMessage
    results.push(row)
  }
  stmt.free()
  return results
}

export function deleteProjectMessages(projectId: string): void {
  const database = ensureDb()
  database.run('DELETE FROM messages WHERE projectId = ?', [projectId])
  persistDb()
}

export function searchMessages(projectId: string, query: string): ChatMessage[] {
  const database = ensureDb()
  const stmt = database.prepare(
    'SELECT id, projectId, role, content, timestamp, metadata FROM messages WHERE projectId = ? AND content LIKE ? ORDER BY timestamp DESC LIMIT 50'
  )
  stmt.bind([projectId, `%${query}%`])

  const results: ChatMessage[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown as ChatMessage
    results.push(row)
  }
  stmt.free()
  return results
}

export function closeDatabase(): void {
  if (db) {
    persistDb()
    db.close()
    db = null
  }
}
