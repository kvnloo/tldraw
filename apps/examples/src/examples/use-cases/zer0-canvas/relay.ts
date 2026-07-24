import { Editor, createShapeId } from 'tldraw'
import { StructuredArtifact, serializeArtifact } from './artifact'
import type { Zer0ArtifactShape } from './Zer0ArtifactShape'

const ZER0_ARTIFACT_TYPE = 'zer0-artifact' as const

interface RelayEvent {
	kind: string
	subject: string
	payload: unknown
	v: number
}

export interface ArtifactPayload {
	v: 1
	id: string
	title: string
	nodes: StructuredArtifact['nodes']
	edges: StructuredArtifact['edges']
	proposal_id?: string
}

export interface CanvasProposal {
	v: 1
	proposal_id: string
	operation: 'artifact.upsert'
	artifact: ArtifactPayload
}

export interface ArtifactEvent {
	v: 1
	seq: 0
	ts_ns: number
	source: 'tldraw.canvas'
	kind: 'artifact.upsert'
	subject: string
	causation: string | null
	payload: ArtifactPayload
}

export interface ExecutionApprovalEvent {
	v: 1
	seq: 0
	ts_ns: number
	source: 'human.tldraw'
	kind: 'issue.command.execute'
	subject: string
	causation: string
	payload: { id: number; approved: true; adapter: 'harness' }
}

export const relayBaseUrl =
	import.meta.env.VITE_ZERO_RELAY_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8787'
export const copilotBaseUrl =
	import.meta.env.VITE_ZERO_COPILOT_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8790'

export const relayEventsUrl = `${relayBaseUrl}/v1/events`

export function artifactEvent(
	payload: ArtifactPayload,
	timestampMs = Date.now(),
	proposalId?: string
): ArtifactEvent {
	return {
		v: 1,
		seq: 0,
		ts_ns: timestampMs * 1_000_000,
		source: 'tldraw.canvas',
		kind: 'artifact.upsert',
		subject: `canvas:artifact:${payload.id}`,
		causation: proposalId ? `canvas:proposal:${proposalId}` : null,
		payload: proposalId ? { ...payload, proposal_id: proposalId } : payload,
	}
}

export async function publishArtifact(
	payload: ArtifactPayload,
	fetcher: typeof fetch = fetch,
	proposalId?: string
): Promise<void> {
	const response = await fetcher(relayEventsUrl, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(artifactEvent(payload, Date.now(), proposalId)),
	})
	if (!response.ok) {
		throw new Error(`Artifact relay rejected the update (${response.status})`)
	}
}

export async function publishProposalPrompt(
	prompt: string,
	proposalId: string,
	fetcher: typeof fetch = fetch
): Promise<void> {
	if (!prompt.trim()) throw new Error('Canvas prompt must not be empty')
	const response = await fetcher(`${copilotBaseUrl}/v1/proposals`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ prompt: prompt.trim(), proposal_id: proposalId }),
	})
	if (!response.ok) throw new Error(`Canvas copilot rejected the prompt (${response.status})`)
}

export function executionApprovalEvent(
	issueId: number,
	timestampMs = Date.now()
): ExecutionApprovalEvent {
	if (!Number.isSafeInteger(issueId) || issueId < 1) throw new Error('Issue id must be positive')
	return {
		v: 1,
		seq: 0,
		ts_ns: timestampMs * 1_000_000,
		source: 'human.tldraw',
		kind: 'issue.command.execute',
		subject: `issue:${issueId}/execute`,
		causation: `issue:${issueId}`,
		payload: { id: issueId, approved: true, adapter: 'harness' },
	}
}

export async function publishExecutionApproval(
	issueId: number,
	fetcher: typeof fetch = fetch
): Promise<void> {
	const response = await fetcher(relayEventsUrl, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(executionApprovalEvent(issueId)),
	})
	if (!response.ok) throw new Error(`Execution approval was rejected (${response.status})`)
}

function parseArtifactPayload(value: unknown): ArtifactPayload | null {
	if (!value || typeof value !== 'object') return null
	const payload = value as Partial<ArtifactPayload>
	if (
		payload.v !== 1 ||
		typeof payload.id !== 'string' ||
		typeof payload.title !== 'string' ||
		!Array.isArray(payload.nodes) ||
		!Array.isArray(payload.edges) ||
		(payload.proposal_id !== undefined && typeof payload.proposal_id !== 'string')
	) {
		return null
	}
	return payload as ArtifactPayload
}

export function parseArtifactEvent(value: string): ArtifactPayload | null {
	try {
		const event = JSON.parse(value) as Partial<RelayEvent>
		if (event.v !== 1 || event.kind !== 'artifact.upsert' || !event.payload) return null
		return parseArtifactPayload(event.payload)
	} catch {
		return null
	}
}

export function parseProposalEvent(value: string): CanvasProposal | null {
	try {
		const event = JSON.parse(value) as Partial<RelayEvent>
		if (event.v !== 1 || event.kind !== 'canvas.mutation.proposed' || !event.payload) {
			return null
		}
		const payload = event.payload as Partial<CanvasProposal>
		const artifact = parseArtifactPayload(payload.artifact)
		if (
			payload.v !== 1 ||
			typeof payload.proposal_id !== 'string' ||
			!payload.proposal_id ||
			payload.operation !== 'artifact.upsert' ||
			!artifact
		) {
			return null
		}
		return { ...payload, artifact } as CanvasProposal
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
