# Editor support

Knap Markdown highlights Knap expressions alongside the editor's built-in Markdown syntax. Files ending in `.knap` or `.knap.md` select it automatically. Existing `.md` templates can use it by selecting **Knap Markdown** manually. Installing the package does not change the language of ordinary Markdown files.

## VS Code and compatible editors

For local development, launch the editor with this repository's extension folder:

```sh
code --extensionDevelopmentPath="$PWD/editors/vscode" "$PWD/editors/examples/article.knap.md"
```

Use `cursor` instead of `code` for Cursor. The extension contains only declarative grammars, language configuration, and snippets; it does not run the template engine.

To associate an existing template folder, add this to workspace settings:

```json
{
  "files.associations": {
    "templates/*.md": "knap"
  }
}
```

To build an installable VSIX, run `pnpm editors:build` from the repository root, then run `pnpm dlx @vscode/vsce package` from `editors/vscode`. Install the resulting file with **Extensions: Install from VSIX**. Marketplace publication is a separate maintainer action; the manifest's `obsidianmd` publisher must be verified before publishing.

## Sublime Text 4

Choose **Preferences → Browse Packages**, create a `Knap` folder there, and copy the contents of `editors/sublime` into it. Open the example template or select **View → Syntax → Knap Markdown** for an existing template.

Sublime inherits its built-in Markdown grammar and uses a separate generated Knap expression grammar. Dedicated Markdown, YAML, HTML, and JavaScript adapters highlight templates inside frontmatter, HTML attributes, inline code, and JavaScript fences. Inheritance avoids recursive `with_prototype` expansion across embedded languages. Host scopes are removed temporarily inside Knap tags and restored afterward, so an expression in a quoted YAML value is not colored as YAML string content. A native grammar is necessary because Sublime cannot include TextMate grammars inside native syntax definitions.

## Included features

- Output expressions, logic tags, whitespace trimming, and multiline comments.
- Strings and escapes, numbers, constants, variables, property access, filters, operators, and nested map expressions.
- Markdown highlighting, including Knap inside frontmatter, HTML, and code spans.
- Template comment toggling and snippets starting with `knap-` in both editors.
- Template delimiter pairing and selection wrapping in VS Code.

The syntax highlighter follows the website's convention of styling bare filter arguments as strings, with expression highlighting for `map`. Those arguments can still resolve to data at runtime; color does not determine their meaning. Validation, data-aware completions, rendering, and Markdown preview integration are outside this initial package. The `knap` language mode does not automatically inherit features contributed specifically for VS Code's `markdown` language ID.

## Maintaining the grammars

```sh
pnpm editors:build
pnpm check
```

`editors/build.mjs` is the source for the TextMate and core Sublime grammars and both sets of snippets. `Knap Expressions.sublime-syntax` contains the generated expression contexts; `Knap.sublime-syntax` selects the Markdown host. The Markdown, YAML, HTML, and JavaScript host adapters are hand-maintained. Generated files are checked in so editor packages can be used without installing Node.js. `pnpm editors:check`, included in `pnpm check`, rejects stale generated files.

`src/language-syntax.json` shares keyword and constant definitions with the website's existing highlighters. Their colors, Markdown punctuation handling, CodeMirror integration, and HTML rendering remain in the website. The tests port its Knap fixtures and exercise VS Code's actual TextMate/Oniguruma engine with standard Markdown, YAML, HTML, and JavaScript grammars, including HTML's derivative grammar. They also check VS Code's encoded string/comment token types and verify that host highlighting resumes after tags and fences close. TextMate retains parent scopes; `meta.embedded` resets the editor token type inside a template.

Sublime context references and YAML structure are checked separately; use Sublime's **Tools → Build System → Syntax Tests** on each of `sublime/syntax_test_knap.knap` and `sublime/syntax_test_knap_yaml.knap` after installation for native positive and negative scope assertions. These native checks require Sublime; the Node test suite does not execute its syntax engine.

The host integration was compared against [Shopify Liquid](https://github.com/Shopify/liquid-tm-grammar), [Twig for VS Code](https://github.com/mblode/vscode-twig-language-2), and [BetterJinja](https://github.com/Sublime-Instincts/BetterJinja). The YAML adapter incorporates BetterJinja's scalar and mapping-key integration techniques; its MIT notice is included in `sublime/ThirdPartyNotices.txt`.

Use **Developer: Inspect Editor Tokens and Scopes** in VS Code or **Show Scope Name** in Sublime to inspect theme behavior in `examples/article.knap.md`.
