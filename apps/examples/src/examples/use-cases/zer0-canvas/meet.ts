import { relayEventsUrl } from './relay'
import { transcribeLocalAudio } from './voice'

export type MeetCaptureState = 'requesting' | 'listening' | 'transcribing' | 'stopped'

export interface MeetTranscriptEvent {
	v: 1
	seq: 0
	ts_ns: number
	source: 'google.meet.live'
	kind: 'meeting.transcript.final'
	subject: string
	causation: string
	payload: {
		provider: 'google-meet-browser-capture'
		conference: string
		participant: string
		consent: string
		segment: number
		realtime: true
		text: string
	}
}

export interface MeetCapture {
	stop(): Promise<void>
}

export interface MeetCaptureOptions {
	conference: string
	participant: string
	consentId: string
	segmentMs?: number
	onState?(state: MeetCaptureState): void
	onTranscript?(text: string): void
}

interface MeetCaptureDependencies {
	getDisplayMedia(constraints: DisplayMediaStreamOptions): Promise<MediaStream>
	recordSegment(stream: MediaStream, durationMs: number, signal: AbortSignal): Promise<Blob>
	transcribe(audio: Blob): Promise<string>
	publish(event: MeetTranscriptEvent): Promise<void>
	now(): number
}

function required(value: string, name: string): string {
	const result = value.trim()
	if (!result) throw new Error(`${name} must not be empty`)
	return result
}

export function meetTranscriptEvent(
	options: Pick<MeetCaptureOptions, 'conference' | 'participant' | 'consentId'>,
	segment: number,
	text: string,
	timestampMs = Date.now()
): MeetTranscriptEvent {
	const conference = required(options.conference, 'Conference')
	const participant = required(options.participant, 'Participant')
	const consent = required(options.consentId, 'Consent id')
	const transcript = required(text, 'Transcript')
	if (!Number.isSafeInteger(segment) || segment < 1) {
		throw new Error('Segment must be a positive integer')
	}
	return {
		v: 1,
		seq: 0,
		ts_ns: timestampMs * 1_000_000,
		source: 'google.meet.live',
		kind: 'meeting.transcript.final',
		subject: ['meet-live', conference, consent, String(segment)]
			.map((value) => encodeURIComponent(value))
			.join(':'),
		causation: `meet-consent:${encodeURIComponent(consent)}`,
		payload: {
			provider: 'google-meet-browser-capture',
			conference,
			participant,
			consent,
			segment,
			realtime: true,
			text: transcript,
		},
	}
}

export async function publishMeetTranscript(
	event: MeetTranscriptEvent,
	fetcher: typeof fetch = fetch
): Promise<void> {
	const response = await fetcher(relayEventsUrl, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(event),
	})
	if (!response.ok) throw new Error(`Meet relay rejected transcript (${response.status})`)
}

function preferredAudioType(): string | undefined {
	return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((type) =>
		MediaRecorder.isTypeSupported(type)
	)
}

export function recordDisplaySegment(
	stream: MediaStream,
	durationMs: number,
	signal: AbortSignal
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const type = preferredAudioType()
		const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
		const chunks: Blob[] = []
		let settled = false
		let timer = 0
		const finish = (error?: Error) => {
			if (settled) return
			settled = true
			window.clearTimeout(timer)
			signal.removeEventListener('abort', stop)
			if (error) {
				reject(error)
				return
			}
			resolve(
				new Blob(chunks, {
					type: recorder.mimeType || type || 'application/octet-stream',
				})
			)
		}
		const stop = () => {
			if (recorder.state !== 'inactive') recorder.stop()
		}
		recorder.addEventListener('dataavailable', (event) => {
			if (event.data.size) chunks.push(event.data)
		})
		recorder.addEventListener('stop', () => finish(), { once: true })
		recorder.addEventListener('error', () => finish(new Error('Meet audio recording failed')), {
			once: true,
		})
		signal.addEventListener('abort', stop, { once: true })
		recorder.start(100)
		timer = window.setTimeout(stop, durationMs)
	})
}

function defaultDependencies(): MeetCaptureDependencies {
	return {
		getDisplayMedia: (constraints) => navigator.mediaDevices.getDisplayMedia(constraints),
		recordSegment: recordDisplaySegment,
		transcribe: transcribeLocalAudio,
		publish: publishMeetTranscript,
		now: Date.now,
	}
}

export async function startMeetCapture(
	options: MeetCaptureOptions,
	dependencies: Partial<MeetCaptureDependencies> = {}
): Promise<MeetCapture> {
	required(options.conference, 'Conference')
	required(options.participant, 'Participant')
	required(options.consentId, 'Consent id')
	const segmentMs = options.segmentMs ?? 2500
	if (!Number.isFinite(segmentMs) || segmentMs < 500) {
		throw new Error('Meet segment duration must be at least 500ms')
	}
	const deps = { ...defaultDependencies(), ...dependencies }
	options.onState?.('requesting')
	const stream = await deps.getDisplayMedia({ audio: true, video: true })
	if (stream.getAudioTracks().length < 1) {
		for (const track of stream.getTracks()) track.stop()
		throw new Error('Share a Meet tab and enable tab audio')
	}

	let stopped = false
	let segment = 0
	const abort = new AbortController()
	const running = (async () => {
		options.onState?.('listening')
		while (!stopped) {
			const audio = await deps.recordSegment(stream, segmentMs, abort.signal)
			if (stopped) break
			if (!audio.size) continue
			options.onState?.('transcribing')
			const text = (await deps.transcribe(audio)).trim()
			if (text) {
				segment += 1
				await deps.publish(meetTranscriptEvent(options, segment, text, deps.now()))
				options.onTranscript?.(text)
			}
			options.onState?.('listening')
		}
	})()

	return {
		async stop() {
			if (stopped) return
			stopped = true
			abort.abort()
			for (const track of stream.getTracks()) track.stop()
			await running
			options.onState?.('stopped')
		},
	}
}
