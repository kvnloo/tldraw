// Deterministic geometry-only simulation for the agent context audit.
// It mirrors the current peripheral grouping rule closely enough to quantify
// the equal-sized-grid failure without needing an Editor instance.

class Box {
	constructor(x, y, w, h) {
		this.x = x
		this.y = y
		this.w = w
		this.h = h
	}
	clone() {
		return new Box(this.x, this.y, this.w, this.h)
	}
	expandBy(n) {
		this.x -= n
		this.y -= n
		this.w += n * 2
		this.h += n * 2
		return this
	}
	includes(b) {
		return (
			b.x >= this.x &&
			b.y >= this.y &&
			b.x + b.w <= this.x + this.w &&
			b.y + b.h <= this.y + this.h
		)
	}
	collides(b) {
		return !(
			b.x > this.x + this.w ||
			b.x + b.w < this.x ||
			b.y > this.y + this.h ||
			b.y + b.h < this.y
		)
	}
	expand(b) {
		const x1 = Math.min(this.x, b.x)
		const y1 = Math.min(this.y, b.y)
		const x2 = Math.max(this.x + this.w, b.x + b.w)
		const y2 = Math.max(this.y + this.h, b.y + b.h)
		this.x = x1
		this.y = y1
		this.w = x2 - x1
		this.h = y2 - y1
		return this
	}
}

function makeGrid(count, { size = 100, gap = 20 } = {}) {
	const cols = Math.ceil(Math.sqrt(count))
	return Array.from({ length: count }, (_, i) => {
		const col = i % cols
		const row = Math.floor(i / cols)
		return new Box(col * (size + gap), row * (size + gap), size, size)
	})
}

function currentClusters(boxes, padding = 75) {
	const groups = []
	for (const raw of boxes) {
		const item = raw.clone().expandBy(padding)
		let landed = false
		for (const group of groups) {
			if (group.includes(item)) {
				group.expand(item)
				landed = true
				break
			}
		}
		if (!landed) groups.push(item)
	}
	return groups
}

function connectedClusters(boxes, padding = 75) {
	let groups = boxes.map((b) => b.clone().expandBy(padding))
	let changed = true
	while (changed) {
		changed = false
		outer: for (let i = 0; i < groups.length; i++) {
			for (let j = i + 1; j < groups.length; j++) {
				if (!groups[i].collides(groups[j])) continue
				groups[i].expand(groups[j])
				groups.splice(j, 1)
				changed = true
				break outer
			}
		}
	}
	return groups
}

const counts = [10, 100, 500, 1000]
const rows = counts.map((count) => {
	const boxes = makeGrid(count)
	const current = currentClusters(boxes).length
	const connected = connectedClusters(boxes).length
	return {
		shapes: count,
		currentClusters: current,
		connectedClusters: connected,
		compressionRatioCurrent: Number((count / current).toFixed(2)),
		compressionRatioConnected: Number((count / connected).toFixed(2)),
	}
})

console.log(JSON.stringify(rows, null, 2))
