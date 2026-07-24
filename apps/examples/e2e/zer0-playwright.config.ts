import { devices, type PlaywrightTestConfig } from '@playwright/test'

const config: PlaywrightTestConfig = {
	testDir: './tests',
	testMatch: 'test-zer0-canvas.spec.ts',
	timeout: 30_000,
	expect: { timeout: 5_000 },
	fullyParallel: false,
	reporter: 'list',
	use: {
		headless: true,
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	outputDir: './test-results/zer0-canvas',
}

export default config
