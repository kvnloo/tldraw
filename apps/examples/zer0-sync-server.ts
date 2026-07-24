import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import websocketPlugin from '@fastify/websocket'
import { NodeSqliteWrapper, SQLiteSyncStorage, TLSocketRoom } from '@tldraw/sync-core'
import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import Database from 'better-sqlite3'
import fastify from 'fastify'
import type { RawData } from 'ws'

const port = Number(process.env.ZERO_SYNC_PORT ?? 15958)
const host = process.env.ZERO_SYNC_HOST ?? '127.0.0.1'
const stateDirectory = process.env.ZERO_SYNC_STATE ?? '.zer0-sync'
mkdirSync(stateDirectory, { recursive: true })

const rooms = new Map<string, TLSocketRoom<any, void>>()
const schema = createTLSchema({
	shapes: {
		...defaultShapeSchemas,
		'zer0-artifact': {
			props: {
				w: T.number,
				h: T.number,
				title: T.string,
				artifact: T.string,
			},
		},
	},
	bindings: defaultBindingSchemas,
})

function roomId(value: string) {
	return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function makeOrLoadRoom(rawId: string) {
	const id = roomId(rawId)
	const existing = rooms.get(id)
	if (existing && !existing.isClosed()) return existing

	const database = new Database(join(stateDirectory, `${id}.db`))
	const storage = new SQLiteSyncStorage({
		sql: new NodeSqliteWrapper(database),
	})
	const room = new TLSocketRoom({
		schema,
		storage,
		onSessionRemoved(current, { numSessionsRemaining }) {
			if (numSessionsRemaining !== 0) return
			current.close()
			database.close()
			rooms.delete(id)
		},
	})
	rooms.set(id, room)
	return room
}

const app = fastify({ logger: false })
await app.register(websocketPlugin, {
	errorHandler(error, socket) {
		console.error('sync websocket handler failed', error)
		socket.close(1011, 'sync handler failed')
	},
})

app.get('/healthz', async () => ({ ok: true }))
app.register(async (scopedApp) => {
	scopedApp.get('/connect/:roomId', { websocket: true }, async (socket, request) => {
		const id = (request.params as { roomId: string }).roomId
		const sessionId = (request.query as { sessionId?: string }).sessionId
		if (!sessionId) {
			socket.close(1008, 'missing sessionId')
			return
		}

		const pending: RawData[] = []
		const collect = (message: RawData) => pending.push(message)
		socket.on('message', collect)

		const room = makeOrLoadRoom(id)
		room.handleSocketConnect({ sessionId, socket })
		socket.off('message', collect)
		for (const message of pending) {
			socket.emit('message', message)
		}
	})
})

await app.listen({ host, port })
process.stdout.write(`Zer0 canvas sync listening on http://${host}:${port}\n`)
