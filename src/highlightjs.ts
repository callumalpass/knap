import { constants, identifier, keywords, number, operator, wordOperators } from './highlighting/rules';

export interface Mode {
	scope?: string | Record<number, string>;
	begin?: string | RegExp | RegExp[];
	end?: string | RegExp;
	match?: RegExp | RegExp[];
	beginScope?: string | Record<number, string>;
	endScope?: string;
	contains?: Mode[];
	relevance?: number;
}
export interface Language {
	name: string;
	disableAutodetect: boolean;
	contains: Mode[];
}

/** Native highlight.js 11 language definition. Register it as `knap`. */
export function knap(): Language {
	const strings: Mode[] = ['"', "'"].map(quote => ({
		scope: 'string', begin: quote, end: quote, relevance: 0,
		contains: [{ begin: /\\[\s\S]/, relevance: 0 }],
	}));
	const atoms: Mode[] = [
		{ scope: 'property', match: new RegExp(`\\.\\s*${identifier}`), relevance: 0 },
		{ scope: 'keyword', match: keywords, relevance: 0 },
		{ scope: 'operator', match: wordOperators, relevance: 0 },
		{ scope: 'literal', match: constants, relevance: 0 },
		{ scope: 'number', match: number, relevance: 0 },
		{ scope: 'operator', match: operator, relevance: 0 },
		{ scope: 'punctuation', match: /[.,:]/, relevance: 0 },
	];
	// A pipe ends a filter argument mode. Keeping it out of the child operator
	// matcher lets the parent mode see it and start the next filter.
	const argumentAtoms = atoms.map(mode => mode.match === operator
		? { ...mode, match: /=>|==|!=|>=|<=|&&|\|\||\?\?|[=<>!+*/-]/ }
		: mode);
	const expression: Mode[] = [];
	const args: Mode[] = [];
	const boundary = /(?=\|(?!\|)|\)|-?\}\}|-?%\}|\{[{%])/;
	const group = (begin: RegExp, end: RegExp, contains: Mode[]): Mode => ({
		begin, end: new RegExp(`${end.source}|(?=-?\\}\\}|-?%\\}|\\{[{%])`),
		beginScope: 'punctuation', endScope: 'punctuation', contains, relevance: 0,
	});
	args.push(...strings, group(/\(/, /\)/, args),
		{ scope: 'string', match: new RegExp(`\\.\\s*${identifier}`), relevance: 0 },
		...argumentAtoms, { scope: 'string', match: new RegExp(identifier), relevance: 0 });
	expression.push(...strings,
		{ scope: 'operator', match: /\|\|/, relevance: 0 },
		{
			begin: [/\|(?!\|)/, /\s*/, /map\b/], beginScope: { 1: 'operator', 3: 'title.function' },
			end: boundary, contains: expression, relevance: 0,
		},
		{
			begin: [/\|(?!\|)/, /\s*/, new RegExp(`(?!map\\b)${identifier}`), /\s*/, /:/],
			beginScope: { 1: 'operator', 3: 'title.function', 5: 'punctuation' },
			end: boundary, contains: args, relevance: 0,
		},
		{
			match: [/\|(?!\|)/, /\s*/, new RegExp(identifier)],
			scope: { 1: 'operator', 3: 'title.function' }, relevance: 0,
		},
		group(/\(/, /\)/, expression), group(/\[/, /\]/, expression), group(/\{(?![{%#])/, /\}/, expression),
		...atoms, { scope: 'variable', match: new RegExp(identifier), relevance: 0 });
	return {
		name: 'Knap',
		// Template delimiters overlap with many other languages. Require an explicit label.
		disableAutodetect: true,
		contains: [
			{ scope: 'comment', begin: /\{#/, end: /#\}/, relevance: 0 },
			...([[/\{\{-?/, /-?\}\}/], [/\{%-?/, /-?%\}/]] as const).map(([begin, end]) => ({
				begin, end: new RegExp(`${end.source}|(?=\\{[{%])`),
				beginScope: 'punctuation', endScope: 'punctuation', contains: expression, relevance: 0,
			})),
		],
	};
}

export default knap;
