import { describe, expect, it } from 'vitest'
import { defaultArtifact, parseArtifact, serializeArtifact } from './artifact'

describe('structured artifact contract', () => {
	it('round trips without losing graph identity', () => {
		expect(parseArtifact(serializeArtifact(defaultArtifact))).toEqual(defaultArtifact)
	})

	it('rejects malformed and unsupported payloads', () => {
		expect(parseArtifact('not json')).toBeNull()
		expect(parseArtifact('{"kind":"xyflow","version":2,"nodes":[],"edges":[]}')).toBeNull()
		expect(parseArtifact('{"kind":"xyflow","version":1,"nodes":{}}')).toBeNull()
	})
})
