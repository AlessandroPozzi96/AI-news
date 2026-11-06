import tseslint from 'typescript-eslint'

export default tseslint.config(
  // out/ holds generated previews (scripts/preview.ts), not source.
  { ignores: ['node_modules', '.wrangler', 'worker-configuration.d.ts', 'out'] },
  ...tseslint.configs.recommended,
)
