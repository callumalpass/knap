// The website's token categories and filter-argument conventions are the basis
// for these grammars. Keep editor-specific state machines out of the runtime.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { stringify } from 'yaml';

const root = new URL('../', import.meta.url);
const syntax = JSON.parse(readFileSync(new URL('src/language-syntax.json', root), 'utf8'));
const check = process.argv.includes('--check');
function output(path, contents) {
  const file = fileURLToPath(new URL(path, root));
  if (check) {
    if (readFileSync(file, 'utf8') !== contents) throw new Error(`${path} is stale. Run pnpm editors:build.`);
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
}
const json = (path, value) => output(path, JSON.stringify(value, null, 2) + '\n');
const include = name => ({ include: `#${name}` });
const match = (match, name) => ({ match, name });
const capture = name => ({ 0: { name } });
const identifier = '[A-Za-z_$][\\w$]*';
const words = values => `\\b(?:${values.join('|')})\\b`;
const boundary = '(?=-?\\}\\}|-?%\\}|\\{[{%])';
const pipe = '\\|(?!\\|)';
const filterEnd = `(?=${pipe}|-?\\}\\}|-?%\\}|\\{[{%]|\\))`;
const repository = {
  tags: { patterns: [include('comment'), include('output'), include('logic')] },
  comment: {
    name: 'comment.block.knap', begin: '\\{#', end: '#\\}',
    beginCaptures: capture('punctuation.definition.comment.begin.knap'),
    endCaptures: capture('punctuation.definition.comment.end.knap'),
  },
  output: {
    name: 'meta.embedded.inline.knap', begin: '\\{\\{-?', end: '-?\\}\\}|(?=\\{[{%])',
    beginCaptures: capture('punctuation.section.embedded.begin.knap'),
    endCaptures: capture('punctuation.section.embedded.end.knap'),
    patterns: [include('expression')],
  },
  logic: {
    name: 'meta.embedded.block.knap', begin: '\\{%-?', end: '-?%\\}|(?=\\{[{%])',
    beginCaptures: capture('punctuation.section.embedded.begin.knap'),
    endCaptures: capture('punctuation.section.embedded.end.knap'),
    patterns: [include('expression')],
  },
  expression: { patterns: [
    include('strings'),
    // A double pipe is boolean OR, never the start of a filter.
    match('\\|\\|', 'keyword.operator.knap'),
    include('map-filter'), include('filter'),
    include('group'), include('array'), include('object'),
    include('atoms'), match(identifier, 'variable.other.knap'),
  ] },
  strings: { patterns: ['"', "'"].map(quote => ({
    name: `string.quoted.${quote === '"' ? 'double' : 'single'}.knap`,
    begin: quote, end: quote,
    beginCaptures: capture('punctuation.definition.string.begin.knap'),
    endCaptures: capture('punctuation.definition.string.end.knap'),
    patterns: [match('\\\\.', 'constant.character.escape.knap')],
  })) },
  'map-filter': {
    begin: `(${pipe})\\s*(map)\\b`, end: filterEnd,
    beginCaptures: { 1: { name: 'keyword.operator.pipe.knap' }, 2: { name: 'support.function.filter.knap' } },
    patterns: [include('expression')],
  },
  filter: {
    begin: `(${pipe})\\s*(${identifier})?`, end: filterEnd,
    beginCaptures: { 1: { name: 'keyword.operator.pipe.knap' }, 2: { name: 'support.function.filter.knap' } },
    patterns: [
      // Support a filter name on the next line, including unfinished input.
      { begin: ':', beginCaptures: capture('punctuation.separator.knap'), end: filterEnd, patterns: [include('arguments')] },
      match(identifier, 'support.function.filter.knap'),
    ],
  },
  arguments: { patterns: [
    include('strings'), include('argument-group'),
    match(`(\\.)\\s*(${identifier})`, 'string.unquoted.argument.knap'),
    include('atoms'),
    // Like the website, style bare argument fallbacks as strings. They may
    // resolve to data at runtime; highlighting does not validate their value.
    match(identifier, 'string.unquoted.argument.knap'),
  ] },
  atoms: { patterns: [
    match(`(\\.)\\s*(${identifier})`, 'variable.other.property.knap'),
    match(words(syntax.tags), 'keyword.control.knap'),
    match(words(syntax.wordOperators), 'keyword.operator.word.knap'),
    match(words(syntax.constants), 'constant.language.knap'),
    match('(?<![\\w$])-?\\d+(?:\\.\\d+)?\\b', 'constant.numeric.knap'),
    match('=>|==|!=|>=|<=|&&|\\|\\||\\?\\?|[=<>!+*/-]', 'keyword.operator.knap'),
    match('\\\\.', 'constant.character.escape.knap'),
    match('[.,:]', 'punctuation.separator.knap'),
  ] },
};
for (const [name, begin, end, patterns] of [
  ['group', '\\(', '\\)', 'expression'],
  ['array', '\\[', '\\]', 'expression'],
  ['object', '\\{(?![{%#])', '\\}', 'expression'],
  ['argument-group', '\\(', '\\)', 'arguments'],
]) repository[name] = {
  begin, end: `${end}|${boundary}`,
  beginCaptures: capture('punctuation.section.group.begin.knap'),
  endCaptures: capture('punctuation.section.group.end.knap'),
  patterns: [include(patterns)],
};

const core = { name: 'Knap', scopeName: 'source.knap', patterns: [include('tags')], repository };
json('editors/vscode/syntaxes/knap.tmLanguage.json', core);
json('editors/vscode/syntaxes/knap-markdown.tmLanguage.json', {
  name: 'Knap Markdown', scopeName: 'text.html.markdown.knap',
  patterns: [{ include: 'source.knap' }, { include: 'text.html.markdown' }],
  injections: {
    'L:text.html.markdown.knap - meta.embedded.inline.knap - meta.embedded.block.knap - comment.block.knap': {
      patterns: [{ include: 'source.knap' }],
    },
    // Markdown normally consumes an entire inline-code span in one match,
    // leaving no opportunity to inject template tokens inside it.
    'L:text.html.markdown.knap - meta.embedded - comment - string - markup.inline.raw - markup.fenced_code - meta.tag': {
      patterns: [
        // Give the host's fenced-code rules precedence over inline backticks.
        { include: 'text.html.markdown#fenced_code_block' },
        {
        name: 'markup.inline.raw.string.markdown', begin: '(`+)', end: '(?<!`)\\1(?!`)',
        beginCaptures: capture('punctuation.definition.raw.markdown'),
        endCaptures: capture('punctuation.definition.raw.markdown'),
        patterns: [{ include: 'source.knap' }],
        },
      ],
    },
  },
});

// Translate the deliberately small TextMate subset above into native Sublime
// contexts, so Markdown's .sublime-syntax can be embedded with a prototype.
const contexts = {};
const captures = value => value && new Map(Object.entries(value).map(([key, value]) => [Number(key), value.name]));
function sublimePatterns(patterns, prefix) {
  return patterns.map((rule, index) => {
    if (rule.include) return { include: rule.include.slice(1) };
    if (rule.match) return { match: rule.match, scope: rule.name };
    const name = `${prefix}-${index}`;
    // Unlike TextMate's meta.embedded token-type reset, Sublime can remove
    // host scopes while a tag is active. Restore them automatically on pop.
    const embedded = ['comment', 'output', 'logic'].includes(prefix);
    contexts[name] = [
      { meta_include_prototype: false },
      ...(embedded ? [{ clear_scopes: true }] : []),
      ...(rule.name ? [{ meta_scope: `${embedded ? 'source.knap ' : ''}${rule.name}` }] : []),
      { match: rule.end, ...(rule.endCaptures ? { captures: captures(rule.endCaptures) } : {}), pop: true },
      ...sublimePatterns(rule.patterns ?? [], name),
    ];
    return { match: rule.begin, ...(rule.beginCaptures ? { captures: captures(rule.beginCaptures) } : {}), push: name };
  });
}
for (const [name, rule] of Object.entries(repository)) {
  contexts[name] = sublimePatterns(rule.begin ? [rule] : rule.patterns, name);
}
output('editors/sublime/Knap Expressions.sublime-syntax', '%YAML 1.2\n---\n# Generated by editors/build.mjs. Do not edit directly.\n' + stringify({
  name: 'Knap expressions', scope: 'source.knap', version: 2, hidden: true,
  contexts: {
    main: [{ include: 'tags' }],
    ...contexts,
  },
}, { lineWidth: 0 }));
output('editors/sublime/Knap.sublime-syntax', '%YAML 1.2\n---\n# Generated by editors/build.mjs. Do not edit directly.\n' + stringify({
  name: 'Knap Markdown', scope: 'text.html.markdown.knap', version: 2,
  file_extensions: ['knap', 'knap.md'],
  extends: 'Packages/Knap/Knap Markdown.sublime-syntax',
}, { lineWidth: 0 }));

// Snippet bodies are shared; each editor gets its own package format.
const snippets = {
  'Output a variable': { prefix: 'knap-var', body: '{{ ${1:title} }}', description: 'Output a value' },
  'Apply a filter': { prefix: 'knap-filter', body: '{{ ${1:title} | ${2:upper} }}', description: 'Output a filtered value' },
  'Conditional block': { prefix: 'knap-if', body: '{% if ${1:condition} %}\n$0\n{% endif %}', description: 'Conditional block' },
  'Conditional with fallback': { prefix: 'knap-ifelse', body: '{% if ${1:condition} %}\n\t${2}\n{% else %}\n\t$0\n{% endif %}', description: 'Conditional block with fallback' },
  'Loop': { prefix: 'knap-for', body: '{% for ${1:item} in ${2:items} %}\n- {{ ${1:item} }}$0\n{% endfor %}', description: 'Loop over a collection' },
  'Set a variable': { prefix: 'knap-set', body: '{% set ${1:name} = ${2:value} %}$0', description: 'Assign a local variable' },
  'Template comment': { prefix: 'knap-comment', body: '{# ${1:comment} #}$0', description: 'Comment removed from rendered output' },
};
json('editors/vscode/snippets/knap.json', snippets);
for (const snippet of Object.values(snippets)) {
  output(`editors/sublime/${snippet.prefix}.sublime-snippet`, `<snippet>\n  <content><![CDATA[${snippet.body}]]></content>\n  <tabTrigger>${snippet.prefix}</tabTrigger>\n  <scope>(text.html.markdown.knap | source.knap) - comment - string</scope>\n  <description>${snippet.description}</description>\n</snippet>\n`);
}
