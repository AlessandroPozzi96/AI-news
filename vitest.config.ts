import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'))
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        // GH_DISPATCH_TOKEN is blanked so a real one in the local .dev.vars can never trigger a real send from a test.
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations, UNSUBSCRIBE_SECRET: 'test-secret', ADMIN_TOKEN: 'test-admin-token-123', GH_DISPATCH_TOKEN: '' },
        },
      }),
    ],
    // Agent worktrees are full copies of the repository: their tests must not run from here.
    test: { exclude: ['**/node_modules/**', '.claude/**'] },
  }
})
