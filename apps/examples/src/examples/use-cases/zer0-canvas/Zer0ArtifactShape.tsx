import { Background, ReactFlow } from '@xyflow/react'
import { useState } from 'react'
import {
	Geometry2d,
	HTMLContainer,
	RecordProps,
	Rectangle2d,
	ShapeUtil,
	T,
	TLResizeInfo,
	TLShape,
	resizeBox,
} from 'tldraw'
import { defaultArtifact, parseArtifact, serializeArtifact } from './artifact'
import { publishExecutionApproval } from './relay'

export const ZER0_ARTIFACT_TYPE = 'zer0-artifact'

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[ZER0_ARTIFACT_TYPE]: { w: number; h: number; title: string; artifact: string }
	}
}

export type Zer0ArtifactShape = TLShape<typeof ZER0_ARTIFACT_TYPE>

function ArtifactCard({ shape }: { shape: Zer0ArtifactShape }) {
	const artifact = parseArtifact(shape.props.artifact)
	const issue = artifact?.nodes.find((node) => Number.isSafeInteger(node.data.issueId))
	const issueId = issue?.data.issueId
	const issueState = issue?.data.state ?? 0
	const [approval, setApproval] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
	const canApprove = typeof issueId === 'number' && issueState === 0 && approval === 'idle'
	const approvalLabel =
		issueState === 3
			? 'Execution failed'
			: issueState >= 2 || approval === 'sent'
				? 'Execution approved'
				: issueState === 1
					? 'Executing'
					: approval === 'sending'
						? 'Approving'
						: approval === 'error'
							? 'Approval failed'
							: 'Approve execution'
	return (
		<HTMLContainer
			className="zer0-artifact"
			data-testid="zer0-artifact"
			data-artifact-title={shape.props.title}
		>
			<header>
				<span>{shape.props.title}</span>
				{typeof issueId === 'number' ? (
					<button
						type="button"
						className="zer0-artifact__approve"
						data-testid="zer0-approve-execution"
						disabled={!canApprove}
						onPointerDown={(event) => event.stopPropagation()}
						onClick={async (event) => {
							event.stopPropagation()
							if (!canApprove) return
							setApproval('sending')
							try {
								await publishExecutionApproval(issueId)
								setApproval('sent')
							} catch {
								setApproval('error')
							}
						}}
					>
						{approvalLabel}
					</button>
				) : null}
			</header>
			<div className="zer0-artifact__graph">
				{artifact ? (
					<ReactFlow
						nodes={artifact.nodes}
						edges={artifact.edges}
						nodesDraggable={false}
						nodesConnectable={false}
						elementsSelectable={false}
						panOnDrag={false}
						zoomOnDoubleClick={false}
						zoomOnPinch={false}
						zoomOnScroll={false}
						fitView
					>
						<Background />
					</ReactFlow>
				) : (
					<p>Unsupported artifact</p>
				)}
			</div>
		</HTMLContainer>
	)
}

export class Zer0ArtifactShapeUtil extends ShapeUtil<Zer0ArtifactShape> {
	static override type = ZER0_ARTIFACT_TYPE
	static override props: RecordProps<Zer0ArtifactShape> = {
		w: T.number,
		h: T.number,
		title: T.string,
		artifact: T.string,
	}

	getDefaultProps(): Zer0ArtifactShape['props'] {
		return {
			w: 420,
			h: 360,
			title: 'Architecture',
			artifact: serializeArtifact(defaultArtifact),
		}
	}

	override canEdit() {
		return false
	}

	override canResize() {
		return true
	}

	override isAspectRatioLocked() {
		return false
	}

	getGeometry(shape: Zer0ArtifactShape): Geometry2d {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
	}

	override onResize(shape: Zer0ArtifactShape, info: TLResizeInfo<Zer0ArtifactShape>) {
		return resizeBox(shape, info)
	}

	component(shape: Zer0ArtifactShape) {
		return <ArtifactCard shape={shape} />
	}

	getIndicatorPath(shape: Zer0ArtifactShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}
