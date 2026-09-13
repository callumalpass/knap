import { describe, expect, test } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import Prism from 'prismjs';
import hljs from 'highlight.js/lib/core';
import { StreamLanguage, StringStream } from '@codemirror/language';
import { classHighlighter, highlightTree } from '@lezer/highlight';
import { knap as prismGrammar, registerKnap as registerPrism } from '../src/prism';
import highlightjs from '../src/highlightjs';
import { knapStreamParser, registerKnap as registerCodeMirror } from '../src/codemirror';
import { templateHighlightStyle, templateLanguage } from '../website/src/scripts/playground-template-editor';

registerPrism(Prism);
hljs.registerLanguage('knap', highlightjs);
const cmLanguage = StreamLanguage.define(knapStreamParser);
const require = createRequire(import.meta.url);
const cm5 = require('codemirror/addon/runmode/runmode.node');
for (const file of ['mode/meta.js', 'mode/markdown/markdown.js']) {
	runInNewContext(readFileSync(require.resolve(`codemirror/${file}`), 'utf8'), { CodeMirror: cm5 });
}
registerCodeMirror(cm5);

interface Span { text: string; classes: string[] }
function htmlSpans(html: string): Span[] {
	const stack: string[][] = [];
	const spans: Span[] = [];
	for (const part of html.split(/(<\/?span\b[^>]*>)/)) {
		if (part.startsWith('<span')) stack.push(part.match(/class="([^"]*)"/)![1].split(' '));
		else if (part === '</span>') stack.pop();
		else if (part) spans.push({ text: part.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" })[entity]!), classes: stack.flat() });
	}
	return spans;
}
function cmSpans(source: string): Span[] {
	const tree = cmLanguage.parser.parse(source);
	const spans: Span[] = [];
	let pos = 0;
	highlightTree(tree, classHighlighter, (from, to, classes) => {
		if (from > pos) spans.push({ text: source.slice(pos, from), classes: [] });
		spans.push({ text: source.slice(from, to), classes: classes.split(' ') });
		pos = to;
	});
	if (pos < source.length) spans.push({ text: source.slice(pos), classes: [] });
	return spans;
}
function cm5Spans(source: string, mode: string | object = 'knap'): Span[] {
	const spans: Span[] = [];
	cm5.runMode(source, mode, (text: string, style: string | null) => {
		if (text) spans.push({ text, classes: style?.split(' ') ?? [] });
	});
	return spans;
}
const engines = [
	{ name: 'Prism', tokens: (source: string) => htmlSpans(Prism.highlight(source, prismGrammar, 'knap')), classes: { variable: 'variable', filter: 'function', keyword: 'keyword', operator: 'operator', string: 'string', comment: 'comment', number: 'number', constant: 'boolean', property: 'property' } },
	{ name: 'highlight.js', tokens: (source: string) => {
		const result = hljs.highlight(source, { language: 'knap' });
		expect(result.errorRaised).toBeUndefined();
		return htmlSpans(result.value);
	}, classes: { variable: 'hljs-variable', filter: 'hljs-title', keyword: 'hljs-keyword', operator: 'hljs-operator', string: 'hljs-string', comment: 'hljs-comment', number: 'hljs-number', constant: 'hljs-literal', property: 'hljs-property' } },
	{ name: 'CodeMirror 6', tokens: cmSpans, classes: { variable: 'tok-variableName', filter: 'tok-variableName2', keyword: 'tok-keyword', operator: 'tok-operator', string: 'tok-string', comment: 'tok-comment', number: 'tok-number', constant: 'tok-atom', property: 'tok-propertyName' } },
	{ name: 'CodeMirror 5', tokens: cm5Spans, classes: { variable: 'variable', filter: 'variable-2', keyword: 'keyword', operator: 'operator', string: 'string', comment: 'comment', number: 'number', constant: 'atom', property: 'property' } },
];

const cases = [
	['{{ title | trim }}', 'title', 'variable'],
	['{{ title12 }}', 'title12', 'variable'],
	['{{ $if }}', '$if', 'variable'],
	['{{ if$ }}', 'if$', 'variable'],
	['{{ title | trim }}', 'trim', 'filter'],
	['{{ title|trim }}', 'title', 'variable'],
	['{{ date | date:"YYYY-MM-DD" | upper }}', 'upper', 'filter'],
	['{{ title |\n upper }}', 'upper', 'filter'],
	['{{ summary ?? "No summary" }}', '??', 'operator'],
	['{{ title | trim ?? true }}', 'true', 'constant'],
	['{% if a || b %}', '||', 'operator'],
	['{% if a || b %}', 'b', 'variable'],
	['{% if a and b %}', 'and', 'operator'],
	['{% elseif enabled %}', 'elseif', 'keyword'],
	['{{ value ?? -12.5 }}', '-12.5', 'number'],
	['{{ true }}', 'true', 'constant'],
	['{{ author.if }}', 'if', 'property'],
	['{{ text | highlight:blue }}', 'blue', 'string'],
	['{{ people | sort:(details.rank, desc) }}', 'rank', 'string'],
	['{{ people | sort:(details.rank, desc) }}', 'desc', 'string'],
	['{{ text | truncatewords:(20, "…") }}', '…', 'string'],
	['{{ people | map:item => item.name }}', 'item', 'variable'],
	['{{ people | map:item => ({name: item.name, flags: [true, false]}) | first }}', 'first', 'filter'],
	['{{ x | map:i => ({a: {b: i}}) | first }}', 'first', 'filter'],
	['{{ value } | upper }}', 'upper', 'filter'],
	['{{ people | map:item => (item.name | upper) | first }}', 'upper', 'filter'],
	['{#\n{{ ignored }} {% if true %} {#\n#}{{ title }}', 'ignored', 'comment'],
	['{#\n{{ ignored }} {% if true %} {#\n#}{{ title }}', 'title', 'variable'],
	['{{ "{# literal #} }} | \\"\nmore" | upper }}', 'more', 'string'],
	['{{ "{# literal #} }} | \\"\nmore" | upper }}', 'upper', 'filter'],
	['{{ broken | sort:(\n{{ title | upper }}', 'upper', 'filter'],
	['{% if missing\n{% set title = "Hi" %}', 'set', 'keyword'],
	['{# unfinished {{ comment', 'comment', 'comment'],
	['{{ "unfinished', 'unfinished', 'string'],
	['<a href="{{ url }}">{{ title }}</a>', 'url', 'variable'],
	['---\ntitle: "{{ title }}"\n---', 'title }}', 'variable'],
	['```text\n{{ content }}\n```', 'content', 'variable'],
] as const;

describe.each(engines)('$name Knap adapter', engine => {
	test.each(cases)('%s → %s is %s', (source, needle, category) => {
		const spans = engine.tokens(source);
		expect(spans.map(span => span.text).join('')).toBe(source);
		const offset = source.indexOf(needle);
		let position = 0;
		const span = spans.find(span => {
			const start = position;
			position += span.text.length;
			return start <= offset && position > offset;
		});
		expect(span?.classes).toContain(engine.classes[category]);
		// Inspect the entire identifier so a correctly styled prefix cannot hide
		// a number or keyword incorrectly recognized inside it.
		if (category === 'variable' && !needle.includes(' ')) {
			let from = 0;
			for (const part of spans) {
				const to = from + part.text.length;
				if (from < offset + needle.length && to > offset) expect(part.classes).toContain(engine.classes.variable);
				from = to;
			}
		}
	});
	test('leaves ordinary text unstyled and resumes it after closing a tag', () => {
		const spans = engine.tokens('Before {{ value }} after');
		expect(spans[0]).toEqual({ text: 'Before ', classes: [] });
		expect(spans.at(-1)).toEqual({ text: ' after', classes: [] });
	});
	test('preserves hostile HTML as text', () => {
		const source = '<script>alert("x")</script> {{ "<img src=x onerror=alert(1)> &" }}';
		expect(engine.tokens(source).map(span => span.text).join('')).toBe(source);
	});
});

test('Prism grammar supports tokenize directly and does not modify Markdown', () => {
	expect(Prism.tokenize('{{ title }}', prismGrammar).some(token => typeof token !== 'string')).toBe(true);
	expect(Prism.languages.knap).toBe(prismGrammar);
});

test('HTML renderers escape markup both outside tags and inside template strings', () => {
	const source = '<script>alert("x")</script> {{ "<img src=x onerror=alert(1)> &" }}';
	for (const html of [Prism.highlight(source, prismGrammar, 'knap'), hljs.highlight(source, { language: 'knap' }).value]) {
		expect(html).not.toMatch(/<(?:script|img)\b/);
		expect(html).toContain('&lt;script');
		expect(html).toContain('&lt;img');
	}
});

test('highlight.js does not autodetect Knap in unrelated text', () => {
	expect(hljs.autoDetection('knap')).toBe(false);
	expect(hljs.highlightAuto('{{ title }}').language).toBeUndefined();
});

test('CodeMirror state copies isolate incremental branches, including nested filters and strings', () => {
	const state = knapStreamParser.startState();
	const line = new StringStream('{{ people | map:item => (item | trim:"unfinished', 4, 2);
	while (!line.eol()) knapStreamParser.token(line, state);
	const copy = knapStreamParser.copyState(state);
	const finish = new StringStream('") }}', 4, 2);
	while (!finish.eol()) knapStreamParser.token(finish, copy);
	expect(copy.close).toBe('');
	expect(state.quote).toBe('"');
	expect(state.groups).toHaveLength(1);
});

test('the playground theme distinguishes filters and retains property and constant styling', () => {
	const source = '{{ author.name | trim ?? true }}';
	const spans: Span[] = [];
	highlightTree(templateLanguage.parser.parse(source), templateHighlightStyle, (from, to, classes) => {
		spans.push({ text: source.slice(from, to), classes: classes.split(' ') });
	});
	expect(spans.find(span => span.text === '.name')?.classes).toContain('syn-variable');
	expect(spans.find(span => span.text === 'trim')?.classes).toContain('syn-filter');
	expect(spans.find(span => span.text === 'true')?.classes).toContain('syn-keyword');
});

test('CodeMirror 5 selects Knap inside Markdown fences and resumes Markdown afterward', () => {
	registerCodeMirror(cm5);
	expect(cm5.modeInfo.filter((mode: { mode: string }) => mode.mode === 'knap')).toHaveLength(1);
	expect(cm5.findModeByName('knap').mime).toBe('text/x-knap');
	const source = '```knap\n{{ title | trim }}\n```\n\n# Heading';
	const spans = cm5Spans(source, { name: 'markdown', fencedCodeBlockHighlighting: true });
	expect(spans.find(span => span.text === 'trim')?.classes).toContain('variable-2');
	expect(spans.find(span => span.text.includes('Heading'))?.classes).toContain('header');
});
