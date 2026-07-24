import { describe, expect, test, vi } from 'vitest'
import { synthesizeLocalSpeech, transcribeLocalAudio } from './voice'

describe('local canvas voice adapter', () => {
	test('browser audio becomes one final ASR transcript', async () => {
		const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
			expect(init.method).toBe('POST')
			expect(init.headers).toEqual({ 'content-type': 'audio/webm' })
			return new Response(JSON.stringify({ text: 'draw the architecture', final: true }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			})
		})
		await expect(
			transcribeLocalAudio(new Blob(['voice'], { type: 'audio/webm' }), fetcher as typeof fetch)
		).resolves.toBe('draw the architecture')
		expect(fetcher).toHaveBeenCalledOnce()
	})

	test('partial or empty ASR output fails closed', async () => {
		const fetcher = vi.fn(
			async () =>
				new Response(JSON.stringify({ text: 'unfinished', final: false }), { status: 200 })
		)
		await expect(
			transcribeLocalAudio(new Blob(['voice']), fetcher as typeof fetch)
		).rejects.toThrow('invalid final transcript')
	})

	test('TTS uses the selected local Kokoro voice', async () => {
		const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
			expect(JSON.parse(String(init.body))).toEqual({
				text: 'Proposal ready',
				voice: 'af_heart',
			})
			return new Response(new Blob(['wav'], { type: 'audio/wav' }), { status: 200 })
		})
		const audio = await synthesizeLocalSpeech(
			' Proposal ready ',
			'af_heart',
			fetcher as typeof fetch
		)
		expect(audio.size).toBe(3)
	})
})
