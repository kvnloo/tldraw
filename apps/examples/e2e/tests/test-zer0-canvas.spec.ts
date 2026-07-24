import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page, Request } from '@playwright/test'

const canvasUrl = process.env.ZERO_CANVAS_URL
const relayUrl = process.env.ZERO_RELAY_URL
const meetEventPath = process.env.ZERO_MEET_EVENT
const llmProposalPath = process.env.ZERO_LLM_PROPOSAL
const executionFixture = process.env.ZERO_EXECUTION_FIXTURE

async function gotoCanvas(page: Page, roomUrl: string) {
	let networkChanged = false
	const trackNetworkChange = (request: Request) => {
		if (request.failure()?.errorText.includes('ERR_NETWORK_CHANGED')) networkChanged = true
	}
	page.on('requestfailed', trackNetworkChange)
	try {
		for (let attempt = 0; attempt < 3; attempt++) {
			networkChanged = false
			await page.goto(roomUrl)
			try {
				await expect(page.getByTestId('zer0-sync-state')).toHaveAttribute(
					'data-state',
					'synced-remote'
				)
				return
			} catch (error) {
				if (!networkChanged || attempt === 2) throw error
			}
		}
	} finally {
		page.off('requestfailed', trackNetworkChange)
	}
}

test.beforeEach(async ({ page }) => {
	page.on('console', (message) => {
		if (message.type() === 'error') console.error(`browser: ${message.text()}`)
	})
	page.on('pageerror', (error) => console.error(`browser page error: ${error.message}`))
	page.on('requestfailed', (request) => {
		if (request.url().includes('/connect/')) {
			console.error(`browser request failed: ${request.url()} ${request.failure()?.errorText}`)
		}
	})
})

test('committed voice becomes a persistent tldraw artifact', async ({ page, request, context }) => {
	test.skip(!canvasUrl || !relayUrl, 'run through integration/canvas-canary')
	test.setTimeout(executionFixture ? 180_000 : 60_000)
	const sourceId = `browser-${randomUUID()}`
	const roomUrl = `${canvasUrl}/zer0-canvas/full?roomId=voice-${sourceId}`
	await gotoCanvas(page, roomUrl)
	await expect(page.getByTestId('zer0-relay-state')).toHaveAttribute('data-state', 'live')

	const title = executionFixture
		? 'Replace the exact contents of counter.txt with the single line `after`, including its trailing newline. Do not change any other file. Verify the final file contents.'
		: `Browser verified ${sourceId}`
	const text = executionFixture
		? 'Execute the approved isolated repository canary exactly as described.'
		: 'Create a browser-verified canvas artifact.'
	const response = await request.post(`${relayUrl}/v1/voice/committed`, {
		data: {
			v: 1,
			committed: true,
			thread: 'browser-canary',
			conversation: 'browser-canary',
			source_id: sourceId,
			source: 'codex.voice',
			text,
			digest: createHash('sha256').update(text).digest('hex'),
			seq: 1,
			ts_ns: 1,
			boundary: { type: 'defect', title },
		},
	})
	expect(response.status()).toBe(202)
	expect(await response.json()).toEqual({ ok: true, emitted: 5 })

	const artifact = page.getByTestId('zer0-artifact').filter({ hasText: title })
	await expect(artifact).toHaveCount(1)
	await expect(artifact.locator('.react-flow__node')).toContainText(title)
	const approval = page.waitForResponse(
		(response) =>
			response.url() === `${relayUrl}/v1/events` &&
			response.request().method() === 'POST' &&
			response.request().postDataJSON().kind === 'issue.command.execute'
	)
	await artifact.getByTestId('zer0-approve-execution').click()
	expect(await (await approval).json()).toEqual({ ok: true, emitted: 1 })

	if (executionFixture) {
		const executedTitle = `Executed: ${title}`
		const executed = page.locator(
			`[data-testid="zer0-artifact"][data-artifact-title="${executedTitle}"]`
		)
		await expect(executed).toHaveCount(1, { timeout: 150_000 })
		await expect(executed.locator('.react-flow__node')).toContainText(executedTitle)
		expect(readFileSync(`${executionFixture}/counter.txt`, 'utf8')).toBe('after\n')

		const synced = await context.newPage()
		await synced.route(`${relayUrl}/v1/events`, (route) => route.abort())
		await gotoCanvas(synced, roomUrl)
		await expect(synced.getByTestId('zer0-sync-state')).toHaveAttribute(
			'data-state',
			'synced-remote'
		)
		await expect(
			synced.locator(`[data-testid="zer0-artifact"][data-artifact-title="${executedTitle}"]`)
		).toHaveCount(1)
		return
	}

	const offline = await context.newPage()
	await offline.route(`${relayUrl}/v1/events`, (route) => route.abort())
	await gotoCanvas(offline, roomUrl)
	await expect(offline.getByTestId('zer0-sync-state')).toHaveAttribute(
		'data-state',
		'synced-remote'
	)
	await expect(offline.getByTestId('zer0-artifact').filter({ hasText: title })).toHaveCount(1)

	// The approval subject is deterministic: a reconnect/retry is a durable no-op.
	await offline.unroute(`${relayUrl}/v1/events`)
	await gotoCanvas(offline, roomUrl)
	await expect(offline.getByTestId('zer0-relay-state')).toHaveAttribute('data-state', 'live')
	const retryArtifact = offline.getByTestId('zer0-artifact').filter({ hasText: title })
	await expect(retryArtifact).toHaveCount(1)
	const retry = offline.waitForResponse(
		(response) =>
			response.url() === `${relayUrl}/v1/events` &&
			response.request().method() === 'POST' &&
			response.request().postDataJSON().kind === 'issue.command.execute'
	)
	await retryArtifact.getByTestId('zer0-approve-execution').click()
	expect(await (await retry).json()).toEqual({ ok: true, emitted: 0 })
})

test('Google Meet Pub/Sub becomes persistent tldraw artifacts', async ({
	page,
	request,
	browser,
}) => {
	test.skip(!canvasUrl || !relayUrl || !meetEventPath, 'run through integration/canvas-canary')
	if (!meetEventPath) throw new Error('ZERO_MEET_EVENT is required')
	const roomUrl = `${canvasUrl}/zer0-canvas/full?roomId=meet-${randomUUID()}`
	await gotoCanvas(page, roomUrl)
	await expect(page.getByTestId('zer0-relay-state')).toHaveAttribute('data-state', 'live')

	const event = JSON.parse(readFileSync(meetEventPath, 'utf8'))
	const response = await request.post(`${relayUrl}/v1/events`, { data: event })
	expect(response.status()).toBe(202)
	expect(await response.json()).toEqual({ ok: true, emitted: 5 })

	const noteTitle = 'Create task verify Meet browser ingestion'
	const issueTitle = 'verify Meet browser ingestion'
	const note = page.locator(`[data-testid="zer0-artifact"][data-artifact-title="${noteTitle}"]`)
	const issue = page.locator(`[data-testid="zer0-artifact"][data-artifact-title="${issueTitle}"]`)
	await expect(note).toHaveCount(1)
	await expect(issue).toHaveCount(1)
	await expect(note.locator('.react-flow__node')).toContainText(noteTitle)
	await expect(issue.locator('.react-flow__node')).toContainText(issueTitle)

	const offlineContext = await browser.newContext()
	const offline = await offlineContext.newPage()
	await offline.route(`${relayUrl}/v1/events`, (route) => route.abort())
	try {
		await gotoCanvas(offline, roomUrl)
		await expect(offline.getByTestId('zer0-sync-state')).toHaveAttribute(
			'data-state',
			'synced-remote'
		)
		await expect(
			offline.locator(`[data-testid="zer0-artifact"][data-artifact-title="${noteTitle}"]`)
		).toHaveCount(1)
		await expect(
			offline.locator(`[data-testid="zer0-artifact"][data-artifact-title="${issueTitle}"]`)
		).toHaveCount(1)
	} finally {
		await offlineContext.close()
	}
})

test('consented live Meet segment becomes a persistent shared artifact', async ({
	page,
	request,
	context,
}) => {
	test.skip(!canvasUrl || !relayUrl, 'run through integration/canvas-canary')
	const identity = randomUUID()
	const roomUrl = `${canvasUrl}/zer0-canvas/full?roomId=meet-live-${identity}`
	await gotoCanvas(page, roomUrl)
	await expect(page.getByTestId('zer0-relay-state')).toHaveAttribute('data-state', 'live')

	const title = `Create task verify live Meet capture ${identity}`
	const issueTitle = `verify live Meet capture ${identity}`
	const event = {
		v: 1,
		seq: 0,
		ts_ns: Date.now() * 1_000_000,
		source: 'google.meet.live',
		kind: 'meeting.transcript.final',
		subject: `meet-live:browser-meet-${identity}:consent-${identity}:1`,
		causation: `meet-consent:consent-${identity}`,
		payload: {
			provider: 'google-meet-browser-capture',
			conference: `browser-meet-${identity}`,
			participant: 'local-user',
			consent: `consent-${identity}`,
			segment: 1,
			realtime: true,
			text: title,
		},
	}
	const response = await request.post(`${relayUrl}/v1/events`, { data: event })
	expect(response.status()).toBe(202)
	expect(await response.json()).toEqual({ ok: true, emitted: 5 })

	const note = page.locator(`[data-testid="zer0-artifact"][data-artifact-title="${title}"]`)
	const issue = page.locator(`[data-testid="zer0-artifact"][data-artifact-title="${issueTitle}"]`)
	await expect(note).toHaveCount(1)
	await expect(issue).toHaveCount(1)

	const synced = await context.newPage()
	await synced.route(`${relayUrl}/v1/events`, (route) => route.abort())
	await gotoCanvas(synced, roomUrl)
	await expect(synced.getByTestId('zer0-sync-state')).toHaveAttribute('data-state', 'synced-remote')
	await expect(
		synced.locator(`[data-testid="zer0-artifact"][data-artifact-title="${title}"]`)
	).toHaveCount(1)
	await expect(
		synced.locator(`[data-testid="zer0-artifact"][data-artifact-title="${issueTitle}"]`)
	).toHaveCount(1)
})

test('BYO LLM proposal requires approval before persistent canvas mutation', async ({
	browser,
	request,
}) => {
	test.skip(!canvasUrl || !relayUrl || !llmProposalPath, 'run through integration/canvas-canary')
	if (!llmProposalPath) throw new Error('ZERO_LLM_PROPOSAL is required')
	const roomUrl = `${canvasUrl}/zer0-canvas/full?roomId=llm-${randomUUID()}`
	const firstContext = await browser.newContext()
	const secondContext = await browser.newContext()
	const syncWitnessContext = await browser.newContext()
	const first = await firstContext.newPage()
	const second = await secondContext.newPage()
	const syncWitness = await syncWitnessContext.newPage()
	await syncWitness.route(`${relayUrl}/v1/events`, (route) => route.abort())
	let title = ''
	try {
		await Promise.all([
			gotoCanvas(first, roomUrl),
			gotoCanvas(second, roomUrl),
			gotoCanvas(syncWitness, roomUrl),
		])
		await Promise.all(
			[first, second, syncWitness].map((client) =>
				expect(client.getByTestId('zer0-sync-state')).toHaveAttribute('data-state', 'synced-remote')
			)
		)

		const proposalEvent = JSON.parse(readFileSync(llmProposalPath, 'utf8'))
		const proposal = proposalEvent.payload
		title = proposal.artifact.title
		const response = await request.post(`${relayUrl}/v1/events`, {
			data: proposalEvent,
		})
		expect(response.status()).toBe(202)
		expect(await response.json()).toEqual({ ok: true, emitted: 1 })

		for (const client of [first, second]) {
			await expect(client.getByTestId('zer0-canvas-proposal')).toContainText(title)
			await expect(
				client.locator(`[data-testid="zer0-artifact"][data-artifact-title="${title}"]`)
			).toHaveCount(0)
		}

		const approval = first.waitForResponse(
			(candidate) =>
				candidate.url() === `${relayUrl}/v1/events` &&
				candidate.request().method() === 'POST' &&
				candidate.request().postDataJSON().kind === 'artifact.upsert' &&
				candidate.request().postDataJSON().payload.proposal_id === proposal.proposal_id
		)
		await first.getByTestId('zer0-approve-proposal').click()
		expect(await (await approval).json()).toEqual({ ok: true, emitted: 1 })

		for (const client of [first, second]) {
			await expect(client.getByTestId('zer0-canvas-proposal')).toHaveCount(0)
			await expect(
				client.locator(`[data-testid="zer0-artifact"][data-artifact-title="${title}"]`)
			).toHaveCount(1)
		}
		await expect(
			syncWitness.locator(`[data-testid="zer0-artifact"][data-artifact-title="${title}"]`)
		).toHaveCount(1)
	} finally {
		await firstContext.close()
		await secondContext.close()
		await syncWitnessContext.close()
	}

	await new Promise((resolve) => setTimeout(resolve, 300))
	const offlineContext = await browser.newContext()
	const offline = await offlineContext.newPage()
	await offline.route(`${relayUrl}/v1/events`, (route) => route.abort())
	try {
		await gotoCanvas(offline, roomUrl)
		await expect(offline.getByTestId('zer0-sync-state')).toHaveAttribute(
			'data-state',
			'synced-remote'
		)
		await expect(
			offline.locator(`[data-testid="zer0-artifact"][data-artifact-title="${title}"]`)
		).toHaveCount(1)
	} finally {
		await offlineContext.close()
	}
})

test('self-hosted sync converges and reloads a persisted room', async ({ browser }) => {
	test.skip(!canvasUrl || !relayUrl, 'run through integration/canvas-canary')
	const roomUrl = `${canvasUrl}/zer0-canvas/full?roomId=zer0-sync-canary`
	const firstContext = await browser.newContext()
	const secondContext = await browser.newContext()
	const first = await firstContext.newPage()
	const second = await secondContext.newPage()
	await second.route(`${relayUrl}/v1/events`, (route) => route.abort())

	try {
		await Promise.all([gotoCanvas(first, roomUrl), gotoCanvas(second, roomUrl)])
		await expect(first.getByTestId('zer0-sync-state')).toHaveAttribute(
			'data-state',
			'synced-remote'
		)
		await expect(second.getByTestId('zer0-sync-state')).toHaveAttribute(
			'data-state',
			'synced-remote'
		)
		await first.waitForFunction(() => Boolean((window as any).__zer0Editor))

		const title = 'Sync-only collaboration marker'
		await first.evaluate((markerTitle) => {
			const editor = (window as any).__zer0Editor
			editor.createShape({
				id: 'shape:zer0-sync-canary',
				type: 'zer0-artifact',
				x: 120,
				y: 120,
				props: {
					w: 420,
					h: 360,
					title: markerTitle,
					artifact: JSON.stringify({
						kind: 'xyflow',
						version: 1,
						nodes: [
							{
								id: 'sync-marker',
								type: 'default',
								position: { x: 0, y: 0 },
								data: { label: markerTitle },
							},
						],
						edges: [],
					}),
				},
			})
		}, title)

		const syncedMarker = second.locator(
			`[data-testid="zer0-artifact"][data-artifact-title="${title}"]`
		)
		await expect(syncedMarker).toHaveCount(1)
		await expect(syncedMarker.locator('.react-flow__node')).toContainText(title)
	} finally {
		await firstContext.close()
		await secondContext.close()
	}

	// With no sessions left the server closes the room and its SQLite handle.
	// A third relay-isolated client must reconstruct the room from disk.
	await new Promise((resolve) => setTimeout(resolve, 300))
	const reloadedContext = await browser.newContext()
	const reloaded = await reloadedContext.newPage()
	await reloaded.route(`${relayUrl}/v1/events`, (route) => route.abort())
	try {
		await gotoCanvas(reloaded, roomUrl)
		await expect(reloaded.getByTestId('zer0-sync-state')).toHaveAttribute(
			'data-state',
			'synced-remote'
		)
		await expect(
			reloaded.locator(
				'[data-testid="zer0-artifact"]' + '[data-artifact-title="Sync-only collaboration marker"]'
			)
		).toHaveCount(1)
	} finally {
		await reloadedContext.close()
	}
})
