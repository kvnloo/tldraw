import { Background, ReactFlow } from '@xyflow/react'
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

export const ZER0_ARTIFACT_TYPE = 'zer0-artifact'

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[ZER0_ARTIFACT_TYPE]: { w: number; h: number; title: string; artifact: string }
	}
}

export type Zer0ArtifactShape = TLShape<typeof ZER0_ARTIFACT_TYPE>

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
		const artifact = parseArtifact(shape.props.artifact)
		return (
			<HTMLContainer className="zer0-artifact">
				<header>{shape.props.title}</header>
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

	getIndicatorPath(shape: Zer0ArtifactShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}
