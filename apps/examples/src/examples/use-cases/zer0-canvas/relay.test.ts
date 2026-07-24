import { describe, expect, it } from 'vitest'
import {
	artifactEvent,
	executionApprovalEvent,
	parseArtifactEvent,
	parseProposalEvent,
	publishArtifact,
	publishExecutionApproval,
	publishProposalPrompt,
} from './relay'

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

	it('creates a provider-neutral durable event envelope', () => {
		const payload = {
			v: 1 as const,
			id: 'architecture-7',
			title: 'Architecture',
			nodes: [],
			edges: [],
		}
		expect(artifactEvent(payload, 123)).toEqual({
			v: 1,
			seq: 0,
			ts_ns: 123_000_000,
			source: 'tldraw.canvas',
			kind: 'artifact.upsert',
			subject: 'canvas:artifact:architecture-7',
			causation: null,
			payload,
		})
		expect(artifactEvent(payload, 123, 'proposal-1')).toMatchObject({
			causation: 'canvas:proposal:proposal-1',
			payload: { ...payload, proposal_id: 'proposal-1' },
		})
	})

	it('parses typed proposals without applying them as artifacts', () => {
		const artifact = {
			v: 1,
			id: 'proposed-architecture',
			title: 'Proposed architecture',
			nodes: [],
			edges: [],
		}
		const event = JSON.stringify({
			v: 1,
			kind: 'canvas.mutation.proposed',
			payload: {
				v: 1,
				proposal_id: 'proposal-1',
				operation: 'artifact.upsert',
				artifact,
			},
		})
		expect(parseProposalEvent(event)).toEqual({
			v: 1,
			proposal_id: 'proposal-1',
			operation: 'artifact.upsert',
			artifact,
		})
		expect(parseArtifactEvent(event)).toBeNull()
	})

	it('publishes canvas actions through the shared relay', async () => {
		const calls: Parameters<typeof fetch>[] = []
		const fetcher = (async (...args: Parameters<typeof fetch>) => {
			calls.push(args)
			return { ok: true, status: 202 } as Response
		}) as typeof fetch
		await publishArtifact(
			{ v: 1, id: 'architecture-8', title: 'Architecture', nodes: [], edges: [] },
			fetcher
		)
		expect(calls).toHaveLength(1)
		expect(calls[0][0]).toBe('http://127.0.0.1:8787/v1/events')
		expect(calls[0][1]).toMatchObject({ method: 'POST' })
	})

	it('publishes one deterministic human execution approval', async () => {
		expect(executionApprovalEvent(73, 123)).toEqual({
			v: 1,
			seq: 0,
			ts_ns: 123_000_000,
			source: 'human.tldraw',
			kind: 'issue.command.execute',
			subject: 'issue:73/execute',
			causation: 'issue:73',
			payload: { id: 73, approved: true, adapter: 'harness' },
		})
		const calls: Parameters<typeof fetch>[] = []
		const fetcher = (async (...args: Parameters<typeof fetch>) => {
			calls.push(args)
			return { ok: true, status: 202 } as Response
		}) as typeof fetch
		await publishExecutionApproval(73, fetcher)
		expect(calls).toHaveLength(1)
		expect(JSON.parse(String(calls[0][1]?.body))).toMatchObject({
			kind: 'issue.command.execute',
			subject: 'issue:73/execute',
		})
	})

	it('submits a prompt only to the configured copilot adapter', async () => {
		const calls: Parameters<typeof fetch>[] = []
		const fetcher = (async (...args: Parameters<typeof fetch>) => {
			calls.push(args)
			return { ok: true, status: 202 } as Response
		}) as typeof fetch
		await publishProposalPrompt('Diagram the fleet', 'proposal-7', fetcher)
		expect(calls[0][0]).toBe('http://127.0.0.1:8790/v1/proposals')
		expect(JSON.parse(String(calls[0][1]?.body))).toEqual({
			prompt: 'Diagram the fleet',
			proposal_id: 'proposal-7',
		})
	})
})
