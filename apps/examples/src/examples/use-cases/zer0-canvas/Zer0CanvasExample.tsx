import { useEffect } from 'react'
import { Tldraw, TldrawUiButton, useEditor } from 'tldraw'
import 'tldraw/tldraw.css'
import '@xyflow/react/dist/style.css'
import { parseArtifactEvent, upsertArtifact } from './relay'
import { ZER0_ARTIFACT_TYPE, Zer0ArtifactShapeUtil } from './Zer0ArtifactShape'
import './zer0-canvas.css'

const shapeUtils = [Zer0ArtifactShapeUtil]

function ArtifactControls() {
	const editor = useEditor()
	return (
		<div className="tlui-menu zer0-canvas-controls">
			<TldrawUiButton
				type="normal"
				onClick={() => {
					const point = editor.getViewportPageBounds().center
					editor.createShape({
						type: ZER0_ARTIFACT_TYPE,
						x: point.x - 210,
						y: point.y - 180,
					})
				}}
			>
				Add architecture artifact
			</TldrawUiButton>
		</div>
	)
}

function ArtifactRelay() {
	const editor = useEditor()
	useEffect(() => {
		const source = new EventSource('http://127.0.0.1:8787/v1/events')
		source.onmessage = ({ data }) => {
			const artifact = parseArtifactEvent(data)
			if (artifact) upsertArtifact(editor, artifact)
		}
		return () => source.close()
	}, [editor])
	return null
}

export default function Zer0CanvasExample() {
	return (
		<div className="tldraw__editor">
			<Tldraw
				persistenceKey="zer0-canvas"
				shapeUtils={shapeUtils}
				components={{ TopPanel: ArtifactControls, InFrontOfTheCanvas: ArtifactRelay }}
				onMount={(editor) => {
					if (!editor.getCurrentPageShapes().some((shape) => shape.type === ZER0_ARTIFACT_TYPE)) {
						editor.createShape({ type: ZER0_ARTIFACT_TYPE, x: 120, y: 120 })
					}
				}}
			/>
		</div>
	)
}
