import { beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Registry, INITIAL, type IGrammar, type IRawGrammar, type StateStack } from 'vscode-textmate';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
import markdown from '@shikijs/langs/markdown';
import yaml from '@shikijs/langs/yaml';
import html from '@shikijs/langs/html';
import htmlDerivative from '@shikijs/langs/html-derivative';
import javascript from '@shikijs/langs/javascript';
import { parse as parseYaml, parseDocument, visit, isScalar } from 'yaml';
import syntax from '../src/language-syntax.json';
import { tokenize } from '../src/tokenizer';
import { highlightLine } from '../website/src/lib/highlight';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
let core: IGrammar;
let template: IGrammar;
let plainMarkdown: IGrammar;
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasm = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  const grammars = [
    JSON.parse(read('editors/vscode/syntaxes/knap.tmLanguage.json')),
    JSON.parse(read('editors/vscode/syntaxes/knap-markdown.tmLanguage.json')),
    ...markdown, ...yaml, ...html, ...htmlDerivative, ...javascript,
  ] as IRawGrammar[];
  const registry = new Registry({
    onigLib: Promise.resolve({ createOnigScanner: patterns => new OnigScanner(patterns), createOnigString: value => new OnigString(value) }),
    loadGrammar: async scope => grammars.find(grammar => grammar.scopeName === scope) ?? null,
  });
  core = (await registry.loadGrammar('source.knap'))!;
  template = (await registry.loadGrammar('text.html.markdown.knap'))!;
  plainMarkdown = (await registry.loadGrammar('text.html.markdown'))!;
});

function tokens(source: string, grammar = core) {
  let state: StateStack = INITIAL;
  return source.split('\n').flatMap(line => {
    const result = grammar.tokenizeLine(line, state);
    expect(result.stoppedEarly).toBeFalsy();
    state = result.ruleStack;
    return result.tokens.map(token => ({ text: line.slice(token.startIndex, token.endIndex), scopes: token.scopes }));
  });
}
function has(source: string, text: string, scope: string, grammar = core) {
  expect(tokens(source, grammar).some(token => token.text === text && token.scopes.includes(scope)), `${JSON.stringify(text)} should have ${scope} in ${source}`).toBe(true);
}

function tokenAt(source: string, needle: string, grammar = template) {
  const offset = source.indexOf(needle);
  expect(offset).toBeGreaterThanOrEqual(0);
  const lines = source.slice(0, offset).split('\n');
  let state: StateStack = INITIAL;
  const sourceLines = source.split('\n');
  for (let line = 0; line < lines.length - 1; line++) state = grammar.tokenizeLine(sourceLines[line], state).ruleStack;
  const line = sourceLines[lines.length - 1];
  const column = lines.at(-1)!.length;
  const token = grammar.tokenizeLine(line, state).tokens.find(token => token.startIndex <= column && token.endIndex > column)!;
  const encoded = grammar.tokenizeLine2(line, state).tokens;
  let metadata = 0;
  for (let index = 0; index < encoded.length && encoded[index] <= column; index += 2) metadata = encoded[index + 1];
  // TextMate's encoded token attributes store StandardTokenType in bits 8–9:
  // 0 = code, 1 = comment, 2 = string, 3 = regular expression.
  return { scopes: token.scopes, type: (metadata >>> 8) & 3 };
}

describe('Knap editor grammar', () => {
  test('uses the runtime keywords and the website token categories', () => {
    for (const word of [...syntax.tags, ...syntax.wordOperators, ...syntax.constants]) {
      expect(tokenize(`{{ ${word} }}`).tokens[1].type).not.toBe('identifier');
      const scope = syntax.tags.includes(word) ? 'keyword.control.knap'
        : syntax.wordOperators.includes(word) ? 'keyword.operator.word.knap' : 'constant.language.knap';
      has(`{{ ${word} }}`, word, scope);
      expect(highlightLine(`{{ ${word} }}`, 'knap')).toContain(`syn-${syntax.constants.includes(word) ? 'constant' : 'keyword'}`);
    }
  });

  test.each([
    ['{{ First name | trim }}', 'First', 'variable.other.knap'],
    ['{{ First name | trim }}', 'name', 'variable.other.knap'],
    ['{{ title | my_custom_filter }}', 'my_custom_filter', 'support.function.filter.knap'],
    ['{{- title -}}', '{{-', 'punctuation.section.embedded.begin.knap'],
    ['{%- if true -%}', '-%}', 'punctuation.section.embedded.end.knap'],
    ['{{ value ?? -12.5 }}', '-12.5', 'constant.numeric.knap'],
    ['{{ author.if }}', '.if', 'variable.other.property.knap'],
    ['{% if a || b %}', 'b', 'variable.other.knap'],
    ['{{ items[0].title }}', '.title', 'variable.other.property.knap'],
    ['{{ value |\n upper }}', 'upper', 'support.function.filter.knap'],
    ['{{ title | upper | trim }}', 'trim', 'support.function.filter.knap'],
  ])('highlights %s', (source, text, scope) => has(source, text, scope));

  // Ported from tests/website-highlight.test.ts: preserve its argument styling.
  test.each([
    ['{{ text | highlight:blue }}', 'blue', 'string.unquoted.argument.knap'],
    ['{{ footer | hr:before }}', 'before', 'string.unquoted.argument.knap'],
    ['{{ blue }}', 'blue', 'variable.other.knap'],
    ['{{ people | map:item => item.name }}', 'item', 'variable.other.knap'],
    ['{{ text | truncatewords:(20, "…") }}', '…', 'string.quoted.double.knap'],
    ['{{ people | sort:(details.rank, desc) }}', 'desc', 'string.unquoted.argument.knap'],
    ['{{ people | sort:(details.rank, desc) }}', '.rank', 'string.unquoted.argument.knap'],
  ])('retains website conventions for %s', (source, text, scope) => has(source, text, scope));

  test('comments span lines, do not nest, and resume at the first closing delimiter', () => {
    const result = tokens('{#\n{{ ignored }} {% if true %} {#\n#}{{ title }}');
    expect(result.filter(token => token.text.includes('ignored'))[0].scopes).toContain('comment.block.knap');
    expect(result.filter(token => token.text === 'title')[0].scopes).toContain('variable.other.knap');
    expect(tokens('{# unfinished').at(-1)!.scopes).toContain('comment.block.knap');
  });

  test('strings protect delimiters, escaped quotes, and pipes, including across lines', () => {
    const source = '{{ "{# literal #} }} | \\"\nmore" | upper }}';
    const result = tokens(source);
    expect(result.some(token => token.scopes.includes('comment.block.knap'))).toBe(false);
    has(source, 'more', 'string.quoted.double.knap');
    has(source, 'upper', 'support.function.filter.knap');
  });

  test('nested map objects do not prematurely close the output tag', () => {
    const source = '{{ people | map:item => ({name: item.name, flags: [true, false]}) | first }}';
    has(source, 'first', 'support.function.filter.knap');
    expect(tokens(source).at(-1)!.scopes).toContain('punctuation.section.embedded.end.knap');
  });

  test('adjacent nested-object braces do not close the output tag', () => {
    const source = '{{ x | map:i => ({a: {b: i}}) | first }}';
    has(source, 'first', 'support.function.filter.knap');
    expect(tokens(source).at(-1)!.scopes).toContain('punctuation.section.embedded.end.knap');
  });

  test('filter chains resume after quoted arguments', () => {
    has('{{ date | date:"YYYY-MM-DD" | upper }}', 'upper', 'support.function.filter.knap');
  });

  test('recovers from unfinished expressions at the next opener', () => {
    has('{{ broken | sort:(\n{{ title | upper }}', 'upper', 'support.function.filter.knap');
    has('{% if missing\n{% set title = "Hi" %}', 'set', 'keyword.control.knap');
  });

  test.each([
    '# Heading {{ title }}',
    '- **{{ title }}**',
    '[{{ title }}](https://example.com)',
    '[link]({{ title }})',
    '`{{ title }}`',
    '---\ntitle: "{{ title }}"\n---',
    '<a href="{{ title }}">link</a>',
    '```text\n{{ title }}\n```',
    '```javascript\nconst title = "{{ title }}";\n```',
  ])('embeds Knap in Markdown: %s', source => has(source, 'title', 'variable.other.knap', template));

  test('keeps Markdown formatting and does not inject into ordinary Markdown', () => {
    expect(tokens('# Heading\n\n**bold**', template).some(token => token.scopes.some(scope => scope.startsWith('markup.heading')))).toBe(true);
    expect(tokens('# {{ title }}', plainMarkdown).some(token => token.scopes.some(scope => scope.endsWith('.knap')))).toBe(false);
    expect(tokens('title if true | upper', template).some(token => token.scopes.includes('variable.other.knap'))).toBe(false);
  });

  test.each([
    ['---\nkey: "before {{ value }} after"\n---\n\n# Heading', 'string.quoted.double.yaml'],
    ["---\nkey: 'before {{ value }} after'\n---\n\n# Heading", 'string.quoted.single.yaml'],
    ['<a href="before {{ value }} after">link</a>\n\n# Heading', 'string.quoted.double.html'],
    ['```javascript\nconst x = "before {{ value }} after";\n```\n\n# Heading', 'string.quoted.double.js'],
  ])('resets the editor token type inside host strings and restores it after: %s', (source, hostString) => {
    expect(tokenAt(source, 'before').scopes).toContain(hostString);
    expect(tokenAt(source, 'value')).toMatchObject({ type: 0 });
    expect(tokenAt(source, 'value').scopes).toContain('variable.other.knap');
    const after = tokenAt(source, 'after');
    expect(after.scopes).toContain(hostString);
    expect(after.type).toBe(2);
    expect(after.scopes).not.toContain('meta.embedded.inline.knap');
    const heading = tokenAt(source, 'Heading');
    expect(heading.scopes.some(scope => scope.startsWith('markup.heading'))).toBe(true);
    expect(heading.scopes).not.toContain(hostString);
  });

  test.each([
    '# Before {{ value }} after',
    '**Before {{ value }} after**',
    '[Before {{ value }} after](https://example.com)',
    '`Before {{ value }} after`',
  ])('restores the same Markdown scopes after an interpolation: %s', source => {
    expect(tokenAt(source, 'after').scopes).toEqual(tokenAt(source, 'Before').scopes);
    expect(tokenAt(source, 'after').scopes).not.toContain('meta.embedded.inline.knap');
  });

  test('Knap comments and strings stay isolated and the next tag resumes normally', () => {
    const source = '---\nkey: "before {# {{ ignored }} #} {{ \'literal {{ nested }}\' | upper }} after"\n---';
    expect(tokenAt(source, 'ignored').type).toBe(1);
    expect(tokenAt(source, 'ignored').scopes).not.toContain('variable.other.knap');
    expect(tokenAt(source, 'nested').type).toBe(2);
    expect(tokenAt(source, 'nested').scopes).toContain('string.quoted.single.knap');
    expect(tokenAt(source, 'nested').scopes).not.toContain('variable.other.knap');
    expect(tokenAt(source, 'upper').scopes).toContain('support.function.filter.knap');
    expect(tokenAt(source, 'after').scopes).toEqual(tokenAt(source, 'before').scopes);
  });

  test.each([
    '---\nkey: {{ value }}\nnext: true\n---\n\n# Heading',
    '---\nkey: [{{ value }}, "after"]\n---\n\n# Heading',
    '---\nkey: |\n  before {{ value }} after\nnext: true\n---\n\n# Heading',
    '---\n{{ field }}: "{{ value }}"\n---\n\n# Heading',
  ])('keeps YAML collections and block scalars bounded by frontmatter: %s', source => {
    expect(tokenAt(source, 'value').scopes).toContain('variable.other.knap');
    const heading = tokenAt(source, 'Heading');
    expect(heading.scopes.some(scope => scope.startsWith('markup.heading'))).toBe(true);
    expect(heading.scopes.some(scope => scope.endsWith('.yaml'))).toBe(false);
  });

  test.each(['```', '````', '~~~'])('preserves JavaScript in %s fences, including backticks and the closing fence', fence => {
    const source = `${fence}javascript\nconst message = \`before {{ value }} after\`;\n${fence}\n\n# Heading`;
    expect(tokenAt(source, 'message').scopes.some(scope => scope.endsWith('.js'))).toBe(true);
    expect(tokenAt(source, 'after').scopes).toContain('string.template.js');
    expect(tokenAt(source, 'after').scopes).not.toContain('markup.inline.raw.string.markdown');
    expect(tokenAt(source, 'Heading').scopes.some(scope => scope.endsWith('.js'))).toBe(false);
  });

  test('Sublime inherits Markdown and keeps expression contexts independent of the host', () => {
    const entry = parseYaml(read('editors/sublime/Knap.sublime-syntax'));
    expect(entry.file_extensions).toEqual(['knap', 'knap.md']);
    expect(entry.extends).toBe('Packages/Knap/Knap Markdown.sublime-syntax');
    const grammar = parseYaml(read('editors/sublime/Knap Expressions.sublime-syntax'));
    expect(grammar.scope).toBe('source.knap');
    expect(grammar.hidden).toBe(true);
    expect(grammar.extends).toBeUndefined();
    for (const context of Object.values(grammar.contexts) as Record<string, unknown>[][]) {
      for (const rule of context) {
        for (const key of ['include', 'push']) {
          if (typeof rule[key] === 'string') expect(grammar.contexts[rule[key]]).toBeDefined();
        }
      }
    }
  });

  test('Sublime capture keys are YAML integers, not quoted strings', () => {
    const document = parseDocument(read('editors/sublime/Knap Expressions.sublime-syntax'));
    expect(document.errors).toEqual([]);
    let captureCount = 0;
    visit(document, {
      Pair(_, pair) {
        if (isScalar(pair.key) && /^\d+$/.test(String(pair.key.value))) {
          captureCount++;
          expect(typeof pair.key.value).toBe('number');
        }
      },
    });
    expect(captureCount).toBeGreaterThan(0);
  });

  test('Sublime host adapters resolve expressions without recursive prototype injection', () => {
    const host = parseYaml(read('editors/sublime/Knap Markdown.sublime-syntax'));
    expect(host.extends).toBe('Packages/Markdown/Markdown.sublime-syntax');
    expect(host.contexts.frontmatter[1].embed).toBe('scope:source.yaml.knap');
    const yamlHost = parseDocument(read('editors/sublime/Knap YAML.sublime-syntax'));
    expect(yamlHost.errors).toEqual([]);
    const yamlGrammar = yamlHost.toJS();
    expect(yamlGrammar.scope).toBe('source.yaml.knap');
    expect(yamlGrammar.extends).toBe('Packages/YAML/YAML.sublime-syntax');
    const base = parseYaml(read('editors/sublime/Knap Expressions.sublime-syntax'));
    for (const name of ['Knap', 'Knap Expressions', 'Knap Markdown', 'Knap YAML', 'Knap HTML', 'Knap JavaScript']) {
      const document = parseDocument(read(`editors/sublime/${name}.sublime-syntax`));
      expect(document.errors).toEqual([]);
      // with_prototype across Markdown's embedded grammars exceeds Sublime's
      // 25,000-context limit; host inheritance avoids that expansion.
      visit(document, {
        Pair(_, pair) {
          if (isScalar(pair.key)) expect(pair.key.value).not.toBe('with_prototype');
        },
      });
      let references = 0;
      for (const context of Object.values(document.toJS().contexts ?? {}) as Record<string, unknown>[][]) {
        for (const rule of context) {
          if (typeof rule.include === 'string' && rule.include.includes('.sublime-syntax#')) {
            const [resource, contextName] = rule.include.split('#');
            expect(resource).toBe('Knap Expressions.sublime-syntax');
            expect(base.contexts[contextName]).toBeDefined();
            references++;
          }
        }
      }
      if (!['Knap', 'Knap Expressions'].includes(name)) expect(references).toBeGreaterThan(0);
    }
  });
});
