export interface ArtifactNode {
	id: string
	position: { x: number; y: number }
	data: {
		label: string
		issueId?: number
		state?: number
		[key: string]: unknown
	}
	type?: string
}

export interface ArtifactEdge {
	id: string
	source: string
	target: string
}

export interface StructuredArtifact {
	kind: 'xyflow'
	version: 1
	nodes: ArtifactNode[]
	edges: ArtifactEdge[]
}

export const defaultArtifact: StructuredArtifact = {
	kind: 'xyflow',
	version: 1,
	nodes: [
		{ id: 'product', position: { x: 20, y: 20 }, data: { label: 'Product' }, type: 'input' },
		{ id: 'feature', position: { x: 20, y: 110 }, data: { label: 'Feature' } },
		{ id: 'agent', position: { x: 20, y: 200 }, data: { label: 'Harness / agent' } },
	],
	edges: [
		{ id: 'product-feature', source: 'product', target: 'feature' },
		{ id: 'feature-agent', source: 'feature', target: 'agent' },
	],
}

export function serializeArtifact(artifact: StructuredArtifact): string {
	return JSON.stringify(artifact)
}

export function parseArtifact(value: string): StructuredArtifact | null {
	try {
		const artifact: unknown = JSON.parse(value)
		if (!artifact || typeof artifact !== 'object') return null
		const candidate = artifact as Partial<StructuredArtifact>
		if (
			candidate.kind !== 'xyflow' ||
			candidate.version !== 1 ||
			!Array.isArray(candidate.nodes) ||
			!Array.isArray(candidate.edges)
		) {
			return null
		}
		return candidate as StructuredArtifact
	} catch {
		return null
	}
}
