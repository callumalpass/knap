import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/html.ts', 'src/cli.ts', 'src/prism.ts', 'src/codemirror.ts', 'src/highlightjs.ts'],
	format: ['esm', 'cjs'],
	// Standalone entry points avoid redundant bare chunk imports, which downstream
	// bundlers warn about when consuming our sideEffects: false package.
	splitting: false,
	dts: true,
	sourcemap: true,
	clean: true,
});
