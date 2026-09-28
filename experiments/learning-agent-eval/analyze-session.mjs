import { readFile } from 'node:fs/promises'

const path = process.argv[2]
if (!path) {
	console.error('usage: node analyze-session.mjs <session.jsonl>')
	process.exit(1)
}

const text = await readFile(path, 'utf8')
const rows = text
	.split(/\r?\n/)
	.filter(Boolean)
	.map((line, index) => {
		try {
			return JSON.parse(line)
		} catch (error) {
			throw new Error(`invalid JSON on line ${index + 1}: ${error.message}`)
		}
	})

const prompts = rows.filter((row) => row.kind === 'prompt')
const actions = rows.filter((row) => row.kind === 'action')
const checks = rows.filter((row) => row.kind === 'check')

const sum = (values) => values.reduce((total, value) => total + value, 0)
const rate = (num, den) => (den ? num / den : 0)
const round = (value) => Math.round(value * 1000) / 1000

const promptBytes = prompts.map((row) => row.totalBytes ?? 0)
const firstPromptBytes = promptBytes[0] ?? 0
const lastPromptBytes = promptBytes.at(-1) ?? 0

const partTotals = {}
for (const prompt of prompts) {
	for (const [part, bytes] of Object.entries(prompt.parts ?? {})) {
		partTotals[part] = (partTotals[part] ?? 0) + Number(bytes || 0)
	}
}

const totalPartBytes = sum(Object.values(partTotals))
const partShares = Object.fromEntries(
	Object.entries(partTotals)
		.sort((a, b) => b[1] - a[1])
		.map(([part, bytes]) => [part, round(rate(bytes, totalPartBytes))])
)

const failedActions = actions.filter((row) => row.error).length
const incompleteActions = actions.filter((row) => row.complete === false).length
const spatialCorrect = checks.filter((row) => row.spatialCorrect === true).length
const semanticCorrect = checks.filter((row) => row.semanticCorrect === true).length
const unrelatedChanges = checks.filter((row) => row.unrelatedRegionChanged === true).length
const correctiveActions = sum(checks.map((row) => row.correctiveActions ?? 0))
const elapsed = checks.map((row) => row.elapsedMs).filter(Number.isFinite)

const report = {
	turns: new Set(rows.map((row) => row.turn).filter(Number.isFinite)).size,
	prompts: prompts.length,
	actions: actions.length,
	checks: checks.length,
	promptBytes: {
		first: firstPromptBytes,
		last: lastPromptBytes,
		growthRatio: round(rate(lastPromptBytes, firstPromptBytes)),
		mean: round(rate(sum(promptBytes), promptBytes.length)),
		partShares,
	},
	actionReliability: {
		failed: failedActions,
		incomplete: incompleteActions,
		failureRate: round(rate(failedActions, actions.length)),
	},
	outcomes: {
		spatialCorrectRate: round(rate(spatialCorrect, checks.length)),
		semanticCorrectRate: round(rate(semanticCorrect, checks.length)),
		unrelatedChangeRate: round(rate(unrelatedChanges, checks.length)),
		correctiveActions,
	},
	elapsedMs: {
		mean: round(rate(sum(elapsed), elapsed.length)),
		max: elapsed.length ? Math.max(...elapsed) : 0,
	},
}

console.log(JSON.stringify(report, null, 2))
