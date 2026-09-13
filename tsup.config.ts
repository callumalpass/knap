import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/html.ts', 'src/cli.ts', 'src/prism.ts', 'src/codemirror.ts', 'src/highlightjs.ts'],
	format: ['esm', 'cjs'],
	dts: true,
	sourcemap: true,
	clean: true,
});
