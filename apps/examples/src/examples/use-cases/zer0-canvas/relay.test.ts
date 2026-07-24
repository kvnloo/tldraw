import { describe, expect, it } from 'vitest'
import { parseArtifactEvent } from './relay'

describe('artifact relay contract', () => {
	it('accepts a versioned artifact event', () => {
		const payload = {
			v: 1,
			id: 'issue-7',
			title: 'Benchmark dispatch',
			nodes: [{ id: 'issue-7', position: { x: 0, y: 0 }, data: { label: 'Benchmark dispatch' } }],
			edges: [],
		}
		expect(
			parseArtifactEvent(
				JSON.stringify({
					v: 1,
					source: 'zer0-relay',
					kind: 'artifact.upsert',
					subject: 'artifact:issue-7',
					payload,
				})
			)
		).toEqual(payload)
	})

	it('rejects unrelated and malformed events', () => {
		expect(parseArtifactEvent('not json')).toBeNull()
		expect(parseArtifactEvent('{"v":1,"kind":"issue.created","payload":{}}')).toBeNull()
		expect(parseArtifactEvent('{"v":2,"kind":"artifact.upsert","payload":{}}')).toBeNull()
	})
})
