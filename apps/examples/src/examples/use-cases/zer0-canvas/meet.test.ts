import { describe, expect, test, vi } from 'vitest'
import { meetTranscriptEvent, publishMeetTranscript, startMeetCapture } from './meet'

function track() {
	return { stop: vi.fn() } as unknown as MediaStreamTrack
}

describe('consented live Meet adapter', () => {
	test('creates a deterministic provider-neutral final transcript event', () => {
		expect(
			meetTranscriptEvent(
				{
					conference: 'spaces/abc',
					participant: 'kvn',
					consentId: 'consent-7',
				},
				2,
				' Diagram the deployment. ',
				123
			)
		).toEqual({
			v: 1,
			seq: 0,
			ts_ns: 123_000_000,
			source: 'google.meet.live',
			kind: 'meeting.transcript.final',
			subject: 'meet-live:spaces%2Fabc:consent-7:2',
			causation: 'meet-consent:consent-7',
			payload: {
				provider: 'google-meet-browser-capture',
				conference: 'spaces/abc',
				participant: 'kvn',
				consent: 'consent-7',
				segment: 2,
				realtime: true,
				text: 'Diagram the deployment.',
			},
		})
	})

	test('publishes through the shared relay contract', async () => {
		const calls: Parameters<typeof fetch>[] = []
		const fetcher = (async (...args: Parameters<typeof fetch>) => {
			calls.push(args)
			return new Response(null, { status: 202 })
		}) as typeof fetch
		const event = meetTranscriptEvent(
			{ conference: 'meet-1', participant: 'kvn', consentId: 'c1' },
			1,
			'Create task benchmark the fleet.'
		)
		await publishMeetTranscript(event, fetcher)
		expect(calls).toHaveLength(1)
		expect(calls[0][0]).toBe('http://127.0.0.1:8787/v1/events')
		expect(JSON.parse(String(calls[0][1]?.body))).toEqual(event)
	})

	test('captures sequential audio only after explicit display consent', async () => {
		const audioTrack = track()
		const videoTrack = track()
		const stream = {
			getAudioTracks: () => [audioTrack],
			getTracks: () => [audioTrack, videoTrack],
		} as unknown as MediaStream
		const states: string[] = []
		const transcripts: string[] = []
		const published: ReturnType<typeof meetTranscriptEvent>[] = []
		let releaseSecond: (() => void) | undefined
		const recordSegment = vi
			.fn()
			.mockResolvedValueOnce(new Blob(['audio'], { type: 'audio/webm' }))
			.mockImplementationOnce(
				(_stream, _duration, signal: AbortSignal) =>
					new Promise<Blob>((resolve) => {
						releaseSecond = () => resolve(new Blob())
						signal.addEventListener('abort', () => resolve(new Blob()), { once: true })
					})
			)
		const capture = await startMeetCapture(
			{
				conference: 'meet-live-1',
				participant: 'kvn',
				consentId: 'consent-live-1',
				segmentMs: 500,
				onState: (state) => states.push(state),
				onTranscript: (text) => transcripts.push(text),
			},
			{
				getDisplayMedia: vi.fn(async () => stream),
				recordSegment,
				transcribe: vi.fn(async () => 'Map the service boundary.'),
				publish: vi.fn(async (event) => {
					published.push(event)
				}),
				now: () => 123,
			}
		)
		await vi.waitFor(() => expect(published).toHaveLength(1))
		await capture.stop()
		releaseSecond?.()
		expect(transcripts).toEqual(['Map the service boundary.'])
		expect(published[0].payload.segment).toBe(1)
		expect(states).toEqual(['requesting', 'listening', 'transcribing', 'listening', 'stopped'])
		expect(audioTrack.stop).toHaveBeenCalledOnce()
		expect(videoTrack.stop).toHaveBeenCalledOnce()
	})

	test('fails closed when the shared tab has no audio track', async () => {
		const videoTrack = track()
		const stream = {
			getAudioTracks: () => [],
			getTracks: () => [videoTrack],
		} as unknown as MediaStream
		await expect(
			startMeetCapture(
				{ conference: 'meet-1', participant: 'kvn', consentId: 'consent-1' },
				{ getDisplayMedia: vi.fn(async () => stream) }
			)
		).rejects.toThrow('enable tab audio')
		expect(videoTrack.stop).toHaveBeenCalledOnce()
	})
})
