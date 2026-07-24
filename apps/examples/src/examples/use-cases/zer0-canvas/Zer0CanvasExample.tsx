import { RemoteTLStoreWithStatus, useSync } from '@tldraw/sync'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
	defaultShapeUtils,
	Editor,
	inlineBase64AssetStore,
	Tldraw,
	TldrawUiButton,
	useEditor,
} from 'tldraw'
import 'tldraw/tldraw.css'
import '@xyflow/react/dist/style.css'
import { defaultArtifact } from './artifact'
import type { MeetCapture, MeetCaptureState } from './meet'
import { startMeetCapture } from './meet'
import type { CanvasProposal } from './relay'
import {
	parseArtifactEvent,
	parseProposalEvent,
	publishArtifact,
	publishProposalPrompt,
	relayEventsUrl,
	upsertArtifact,
} from './relay'
import type { VoiceAdapterState, VoiceRecording } from './voice'
import {
	speakLocalText,
	startBrowserRecording,
	stopLocalSpeech,
	transcribeLocalAudio,
} from './voice'
import { Zer0ArtifactShapeUtil } from './Zer0ArtifactShape'
import './zer0-canvas.css'

const shapeUtils = [Zer0ArtifactShapeUtil]
const syncShapeUtils = [...defaultShapeUtils, ...shapeUtils]
const syncBaseUrl = import.meta.env.VITE_ZERO_SYNC_URL?.replace(/\/$/, '')
type RelayStatus = 'connecting' | 'live' | 'error'
const RelayStatusContext = createContext<{
	status: RelayStatus
	setStatus(status: RelayStatus): void
}>({ status: 'connecting', setStatus: () => {} })
const ProposalContext = createContext<{
	proposals: CanvasProposal[]
	addProposal(proposal: CanvasProposal): void
	completeProposal(proposalId: string): void
}>({ proposals: [], addProposal: () => {}, completeProposal: () => {} })

function ArtifactControls() {
	const relay = useContext(RelayStatusContext)
	const { proposals } = useContext(ProposalContext)
	const [publishing, setPublishing] = useState(false)
	const [publishError, setPublishError] = useState(false)
	const [prompt, setPrompt] = useState('')
	const [proposalBusy, setProposalBusy] = useState(false)
	const [proposalError, setProposalError] = useState(false)
	const [voiceState, setVoiceState] = useState<VoiceAdapterState>('idle')
	const [transcript, setTranscript] = useState('')
	const [meetState, setMeetState] = useState<MeetCaptureState | 'idle' | 'error'>('idle')
	const [meetTranscript, setMeetTranscript] = useState('')
	const recording = useRef<VoiceRecording | null>(null)
	const meetCapture = useRef<MeetCapture | null>(null)
	const releaseRequested = useRef(false)
	useEffect(
		() => () => {
			recording.current?.cancel()
			void meetCapture.current?.stop()
		},
		[]
	)
	const pending = proposals[0]
	const finishRecording = async (current: VoiceRecording) => {
		if (recording.current !== current) return
		recording.current = null
		try {
			setVoiceState('transcribing')
			const text = await transcribeLocalAudio(await current.stop())
			setTranscript(text)
			setVoiceState('proposing')
			await publishProposalPrompt(text, crypto.randomUUID())
			setVoiceState('idle')
		} catch {
			setVoiceState('error')
		}
	}
	const startVoice = async () => {
		if (voiceState !== 'idle' && voiceState !== 'error') return
		releaseRequested.current = false
		setVoiceState('requesting')
		try {
			const current = await startBrowserRecording()
			recording.current = current
			if (releaseRequested.current) {
				await finishRecording(current)
			} else {
				setVoiceState('listening')
			}
		} catch {
			setVoiceState('error')
		}
	}
	const stopVoice = async () => {
		releaseRequested.current = true
		const current = recording.current
		if (current) await finishRecording(current)
	}
	const startMeet = async () => {
		if (meetCapture.current || (meetState !== 'idle' && meetState !== 'error')) return
		setMeetState('requesting')
		const consentId = crypto.randomUUID()
		try {
			meetCapture.current = await startMeetCapture({
				conference: `browser-meet-${consentId}`,
				participant: 'local-user',
				consentId,
				onState: (state) => setMeetState(state === 'stopped' ? 'idle' : state),
				onTranscript: setMeetTranscript,
			})
		} catch {
			meetCapture.current = null
			setMeetState('error')
		}
	}
	const stopMeet = async () => {
		const current = meetCapture.current
		meetCapture.current = null
		if (!current) return
		try {
			await current.stop()
			setMeetState('idle')
		} catch {
			setMeetState('error')
		}
	}
	const label = publishing
		? 'Saving'
		: publishError || relay.status === 'error'
			? 'Relay unavailable'
			: relay.status === 'connecting'
				? 'Connecting'
				: 'Live'
	return (
		<div className="tlui-menu zer0-canvas-controls">
			<TldrawUiButton
				type="normal"
				disabled={publishing}
				onClick={async () => {
					setPublishing(true)
					setPublishError(false)
					const id = `architecture-${crypto.randomUUID()}`
					try {
						await publishArtifact({
							v: 1,
							id,
							title: 'Architecture',
							nodes: defaultArtifact.nodes,
							edges: defaultArtifact.edges,
						})
					} catch {
						setPublishError(true)
					} finally {
						setPublishing(false)
					}
				}}
			>
				{publishing ? 'Publishing…' : 'Add persistent architecture'}
			</TldrawUiButton>
			<form
				className="zer0-copilot"
				onSubmit={async (event) => {
					event.preventDefault()
					if (!prompt.trim() || proposalBusy) return
					setProposalBusy(true)
					setProposalError(false)
					try {
						await publishProposalPrompt(prompt, crypto.randomUUID())
						setPrompt('')
					} catch {
						setProposalError(true)
					} finally {
						setProposalBusy(false)
					}
				}}
			>
				<input
					data-testid="zer0-copilot-prompt"
					aria-label="Ask canvas copilot"
					value={prompt}
					placeholder="Ask the canvas…"
					onChange={(event) => setPrompt(event.currentTarget.value)}
				/>
				<button
					type="submit"
					data-testid="zer0-copilot-submit"
					disabled={!prompt.trim() || proposalBusy}
				>
					{proposalBusy ? 'Proposing…' : proposalError ? 'Retry proposal' : 'Propose'}
				</button>
			</form>
			<div className="zer0-voice">
				<button
					type="button"
					data-testid="zer0-push-to-talk"
					data-state={voiceState}
					disabled={
						voiceState === 'transcribing' || voiceState === 'proposing' || voiceState === 'speaking'
					}
					onPointerDown={(event) => {
						event.currentTarget.setPointerCapture(event.pointerId)
						void startVoice()
					}}
					onPointerUp={() => void stopVoice()}
					onPointerCancel={() => void stopVoice()}
				>
					{voiceState === 'requesting'
						? 'Allow microphone…'
						: voiceState === 'listening'
							? 'Listening… release to send'
							: voiceState === 'transcribing'
								? 'Transcribing…'
								: voiceState === 'proposing'
									? 'Creating proposal…'
									: voiceState === 'error'
										? 'Voice failed — hold to retry'
										: 'Hold to talk'}
				</button>
				{transcript ? (
					<span data-testid="zer0-voice-transcript" title={transcript}>
						{transcript}
					</span>
				) : null}
			</div>
			<div className="zer0-meet">
				<button
					type="button"
					data-testid="zer0-meet-capture"
					data-state={meetState}
					onClick={() => (meetCapture.current ? void stopMeet() : void startMeet())}
					disabled={meetState === 'requesting' || meetState === 'transcribing'}
					title="Explicitly share the active Google Meet tab with tab audio"
				>
					{meetState === 'requesting'
						? 'Choose Meet tab…'
						: meetState === 'listening'
							? 'Stop Meet capture'
							: meetState === 'transcribing'
								? 'Transcribing Meet…'
								: meetState === 'error'
									? 'Meet capture failed — retry'
									: 'Track Meet live'}
				</button>
				{meetTranscript ? (
					<span data-testid="zer0-meet-transcript" title={meetTranscript}>
						{meetTranscript}
					</span>
				) : null}
			</div>
			{pending ? (
				<div className="zer0-proposal" data-testid="zer0-canvas-proposal">
					<span>{pending.artifact.title}</span>
					<button
						type="button"
						data-testid="zer0-speak-proposal"
						disabled={voiceState === 'speaking'}
						onClick={async () => {
							setVoiceState('speaking')
							try {
								await speakLocalText(pending.artifact.title)
								setVoiceState('idle')
							} catch {
								stopLocalSpeech()
								setVoiceState('error')
							}
						}}
					>
						Hear
					</button>
					<button
						type="button"
						data-testid="zer0-approve-proposal"
						disabled={publishing}
						onClick={async () => {
							setPublishing(true)
							setPublishError(false)
							try {
								await publishArtifact(pending.artifact, fetch, pending.proposal_id)
							} catch {
								setPublishError(true)
							} finally {
								setPublishing(false)
							}
						}}
					>
						Approve
					</button>
				</div>
			) : null}
			<span
				className={`zer0-canvas-status zer0-canvas-status--${relay.status}`}
				data-testid="zer0-relay-state"
				data-state={relay.status}
			>
				{label}
			</span>
		</div>
	)
}

function ArtifactRelay() {
	const editor = useEditor()
	const { setStatus } = useContext(RelayStatusContext)
	const { addProposal, completeProposal } = useContext(ProposalContext)
	useEffect(() => {
		setStatus('connecting')
		const source = new EventSource(relayEventsUrl)
		source.onopen = () => setStatus('live')
		source.onerror = () => setStatus('error')
		source.onmessage = ({ data }) => {
			const artifact = parseArtifactEvent(data)
			if (artifact) {
				upsertArtifact(editor, artifact)
				if (artifact.proposal_id) completeProposal(artifact.proposal_id)
				return
			}
			const proposal = parseProposalEvent(data)
			if (proposal) addProposal(proposal)
		}
		return () => source.close()
	}, [addProposal, completeProposal, editor, setStatus])
	return null
}

function mountEditor(editor: Editor) {
	if (import.meta.env.VITE_ZERO_E2E === '1') {
		;(window as Window & { __zer0Editor?: Editor }).__zer0Editor = editor
	}
}

function Canvas({ store }: { store?: RemoteTLStoreWithStatus }) {
	const [relayStatus, setRelayStatus] = useState<RelayStatus>('connecting')
	const [proposals, setProposals] = useState<CanvasProposal[]>([])
	const addProposal = useCallback((proposal: CanvasProposal) => {
		setProposals((current) =>
			current.some((item) => item.proposal_id === proposal.proposal_id)
				? current
				: [...current, proposal]
		)
	}, [])
	const completeProposal = useCallback((proposalId: string) => {
		setProposals((current) => current.filter((proposal) => proposal.proposal_id !== proposalId))
	}, [])
	const common = {
		shapeUtils,
		components: {
			TopPanel: ArtifactControls,
			InFrontOfTheCanvas: ArtifactRelay,
		},
		onMount: mountEditor,
	}
	return (
		<RelayStatusContext.Provider value={{ status: relayStatus, setStatus: setRelayStatus }}>
			<ProposalContext.Provider value={{ proposals, addProposal, completeProposal }}>
				<div className="tldraw__editor">
					{store ? (
						<Tldraw store={store} {...common} />
					) : (
						<Tldraw persistenceKey="zer0-canvas" {...common} />
					)}
				</div>
			</ProposalContext.Provider>
		</RelayStatusContext.Provider>
	)
}

function SyncedCanvas({ roomId }: { roomId: string }) {
	const store = useSync({
		uri: `${syncBaseUrl}/connect/${encodeURIComponent(roomId)}`,
		roomId,
		assets: inlineBase64AssetStore,
		shapeUtils: syncShapeUtils,
	})
	return (
		<>
			<span data-testid="zer0-sync-state" data-state={store.status} hidden />
			<Canvas store={store} />
		</>
	)
}

export default function Zer0CanvasExample({ roomId = 'zer0-canvas' }: { roomId?: string }) {
	return syncBaseUrl ? <SyncedCanvas roomId={roomId} /> : <Canvas />
}
