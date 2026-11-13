import tseslint from 'typescript-eslint'

export default tseslint.config(
  // out/ holds generated previews (scripts/preview.ts), not source; .claude/ holds agent worktrees (full copies).
  { ignores: ['node_modules', '.wrangler', 'worker-configuration.d.ts', 'out', '.claude'] },
  ...tseslint.configs.recommended,
)
