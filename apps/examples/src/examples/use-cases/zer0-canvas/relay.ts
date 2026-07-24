import { Editor, createShapeId } from 'tldraw'
import { StructuredArtifact, serializeArtifact } from './artifact'
import { ZER0_ARTIFACT_TYPE, Zer0ArtifactShape } from './Zer0ArtifactShape'

interface RelayEvent {
	kind: string
	subject: string
	payload: unknown
	v: number
}

interface ArtifactPayload {
	v: 1
	id: string
	title: string
	nodes: StructuredArtifact['nodes']
	edges: StructuredArtifact['edges']
}

export function parseArtifactEvent(value: string): ArtifactPayload | null {
	try {
		const event = JSON.parse(value) as Partial<RelayEvent>
		if (event.v !== 1 || event.kind !== 'artifact.upsert' || !event.payload) return null
		const payload = event.payload as Partial<ArtifactPayload>
		if (
			payload.v !== 1 ||
			typeof payload.id !== 'string' ||
			typeof payload.title !== 'string' ||
			!Array.isArray(payload.nodes) ||
			!Array.isArray(payload.edges)
		) {
			return null
		}
		return payload as ArtifactPayload
	} catch {
		return null
	}
}

export function upsertArtifact(editor: Editor, payload: ArtifactPayload) {
	const id = createShapeId(`zer0-${payload.id}`)
	const artifact: StructuredArtifact = {
		kind: 'xyflow',
		version: 1,
		nodes: payload.nodes,
		edges: payload.edges,
	}
	const props = { title: payload.title, artifact: serializeArtifact(artifact) }
	if (editor.getShape<Zer0ArtifactShape>(id)) {
		editor.updateShape<Zer0ArtifactShape>({ id, type: ZER0_ARTIFACT_TYPE, props })
		return
	}
	const count = editor
		.getCurrentPageShapes()
		.filter((shape) => shape.type === ZER0_ARTIFACT_TYPE).length
	editor.createShape<Zer0ArtifactShape>({
		id,
		type: ZER0_ARTIFACT_TYPE,
		x: 80 + (count % 3) * 460,
		y: 80 + Math.floor(count / 3) * 400,
		props,
	})
}
