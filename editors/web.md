# JavaScript syntax highlighting

Knap provides optional `knap/prism`, `knap/codemirror`, and `knap/highlightjs` entry points in ESM and CommonJS, with TypeScript declarations. They contain highlighting definitions only and do not import the template renderer or an editor engine. Install the engine you use separately.

These adapters highlight Knap tags in explicitly selected template text or fenced `knap` code blocks. Text outside tags is left unstyled. They do not change ordinary Markdown highlighting or provide a full Markdown, YAML, or HTML host grammar. The VS Code and Sublime packages provide that broader host integration.

## Prism 1

```ts
import Prism from 'prismjs';
import { registerKnap } from 'knap/prism';

registerKnap(Prism);
const html = Prism.highlight(source, Prism.languages.knap, 'knap');
```

You can also import the default grammar and assign it to `Prism.languages.knap`. Both `Prism.tokenize` and `Prism.highlightElement` work normally. Register the grammar before highlighting elements with `class="language-knap"`. When using a Prism worker, register the grammar in the worker as well.

In Obsidian, register the grammar in the `after` callback of `prismLoadable` in `src/shared/ext.ts`. This runs before reading view calls `Prism.highlightElement`, including when the loader is used directly rather than through `loadPrism()`.

## CodeMirror 6

```ts
import { StreamLanguage } from '@codemirror/language';
import { knapStreamParser } from 'knap/codemirror';

const knapLanguage = StreamLanguage.define(knapStreamParser);

// Include knapLanguage in your EditorState extensions.
```

The parser uses the CodeMirror 5 token names that CodeMirror 6 already understands: `variable`, `variable-2` for filters, `property`, `keyword`, `operator`, `atom`, `number`, `string`, `comment`, and `punctuation`. In CodeMirror 6, `variable-2` maps to `tags.special(tags.variableName)` and `property` maps to `tags.propertyName`; include those tags in a custom `HighlightStyle` when assigning explicit colors. Comment delimiters and independent copies of multiline parser state are included. Knap's website uses this same parser with its existing theme and Markdown punctuation styling.

## CodeMirror 5 and Obsidian's HyperMD integration

```ts
import { registerKnap } from 'knap/codemirror';

registerKnap(CodeMirror);
```

This registers a `knap` mode, the `text/x-knap` MIME type, and a language metadata entry when `CodeMirror.modeInfo` is available. In Obsidian, call it in the `after` callback of `codemirrorModesLoadable`. Obsidian uses the CodeMirror 5 mode registry inside its CodeMirror 6 HyperMD parser, so this makes fenced `knap` blocks available in both Source mode and Live Preview.

## highlight.js 11

```ts
import hljs from 'highlight.js/lib/core';
import knap from 'knap/highlightjs';

hljs.registerLanguage('knap', knap);
const html = hljs.highlight(source, { language: 'knap' }).value;
```

The same registration works with the full `highlight.js` bundle and with `highlightElement`. Knap is excluded from automatic language detection because its delimiters overlap other template languages; use a `knap` fence or `language-knap` class. The adapter uses standard highlight.js classes, including `hljs-title function_` for filters, so existing themes supply the colors.

In Obsidian Clipper, register it alongside the highlight.js import in `src/utils/reader.ts` to highlight Knap blocks in reader mode.

## Testing with sibling checkouts

Build Knap first:

```sh
pnpm build
```

From the sibling Obsidian checkout, link the package:

```sh
pnpm add -D knap@link:../knap
```

Clipper currently uses an older Knap renderer. A separate local dependency name allows testing the new adapter independently:

```sh
npm install knap-syntax@file:../knap
```

Import `knap-syntax/highlightjs` in that setup. Both links resolve the built `dist` files; rebuild Knap after adapter changes and rebuild the consuming app. These sibling links are for local development. Before shipping, replace them with a published Knap version containing the adapters. Clipper can use `knap/highlightjs` after its renderer dependency is upgraded, or retain an npm alias for the newer package.

## Validation

`pnpm check` exercises the actual Prism, highlight.js, and CodeMirror 5 and 6 engines against shared fixtures for operators, filter arguments, nested map expressions, escaped and multiline strings, comments, incomplete input, source preservation, and Markdown fence selection. The adapters share the keyword and constant definitions in `src/language-syntax.json`; editor-specific matching and state handling live in their respective modules.
