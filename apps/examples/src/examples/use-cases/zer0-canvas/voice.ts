export type VoiceAdapterState =
	| 'idle'
	| 'requesting'
	| 'listening'
	| 'transcribing'
	| 'proposing'
	| 'speaking'
	| 'error'

export interface VoiceRecording {
	stop(): Promise<Blob>
	cancel(): void
}

export interface ASRAdapter {
	start(): Promise<VoiceRecording>
	transcribe(audio: Blob): Promise<string>
}

export interface TTSAdapter {
	speak(text: string): Promise<void>
	stop(): void
}

export const localVoiceBaseUrl =
	import.meta.env.VITE_ZERO_VOICE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8791'

export async function transcribeLocalAudio(
	audio: Blob,
	fetcher: typeof fetch = fetch
): Promise<string> {
	if (!audio.size) throw new Error('No microphone audio was captured')
	const response = await fetcher(`${localVoiceBaseUrl}/v1/asr`, {
		method: 'POST',
		headers: { 'content-type': audio.type || 'application/octet-stream' },
		body: audio,
	})
	if (!response.ok) throw new Error(`Local ASR failed (${response.status})`)
	const result = (await response.json()) as { text?: unknown; final?: unknown }
	if (result.final !== true || typeof result.text !== 'string' || !result.text.trim()) {
		throw new Error('Local ASR returned an invalid final transcript')
	}
	return result.text.trim()
}

export async function synthesizeLocalSpeech(
	text: string,
	voice = 'af_heart',
	fetcher: typeof fetch = fetch
): Promise<Blob> {
	if (!text.trim()) throw new Error('TTS text must not be empty')
	const response = await fetcher(`${localVoiceBaseUrl}/v1/tts`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ text: text.trim(), voice }),
	})
	if (!response.ok) throw new Error(`Local TTS failed (${response.status})`)
	const audio = await response.blob()
	if (!audio.size) throw new Error('Local TTS returned empty audio')
	return audio
}

export async function startBrowserRecording(): Promise<VoiceRecording> {
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: {
			autoGainControl: false,
			echoCancellation: true,
			noiseSuppression: true,
			channelCount: 1,
		},
	})
	const preferred = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((type) =>
		MediaRecorder.isTypeSupported(type)
	)
	const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined)
	const chunks: Blob[] = []
	let settled = false
	recorder.addEventListener('dataavailable', (event) => {
		if (event.data.size) chunks.push(event.data)
	})
	recorder.start(100)

	const release = () => {
		for (const track of stream.getTracks()) track.stop()
	}
	return {
		stop() {
			if (settled) return Promise.reject(new Error('Recording already ended'))
			settled = true
			return new Promise<Blob>((resolve, reject) => {
				recorder.addEventListener(
					'stop',
					() => {
						release()
						const audio = new Blob(chunks, {
							type: recorder.mimeType || preferred || 'application/octet-stream',
						})
						if (audio.size) {
							resolve(audio)
						} else {
							reject(new Error('No microphone audio was captured'))
						}
					},
					{ once: true }
				)
				recorder.stop()
			})
		},
		cancel() {
			if (settled) return
			settled = true
			recorder.stop()
			release()
		},
	}
}

let playing: HTMLAudioElement | null = null
let playingUrl: string | null = null

export function stopLocalSpeech() {
	playing?.pause()
	playing = null
	if (playingUrl) URL.revokeObjectURL(playingUrl)
	playingUrl = null
}

export async function speakLocalText(text: string): Promise<void> {
	stopLocalSpeech()
	const audio = await synthesizeLocalSpeech(text)
	const url = URL.createObjectURL(audio)
	const player = new Audio(url)
	playing = player
	playingUrl = url
	await new Promise<void>((resolve, reject) => {
		player.addEventListener('ended', () => resolve(), { once: true })
		player.addEventListener('error', () => reject(new Error('Audio playback failed')), {
			once: true,
		})
		void player.play().catch(reject)
	})
	if (playing === player) stopLocalSpeech()
}
