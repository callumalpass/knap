import { constants, identifier, keywords, number, operator, quoted, wordOperators } from './highlighting/rules';

// Structural types keep the adapter usable without installing Prism's type package.
export interface Grammar {
	[token: string]: RegExp | GrammarToken | (RegExp | GrammarToken)[];
}
export interface GrammarToken {
	pattern: RegExp;
	lookbehind?: boolean;
	greedy?: boolean;
	alias?: string;
	inside?: Grammar;
}

const string = { pattern: new RegExp(quoted), greedy: true };
const balancedBraces = (depth: number): string => depth === 0
	? String.raw`\{[^{}]*\}`
	: String.raw`\{(?:${quoted}|${balancedBraces(depth - 1)}|[^{}"'])*\}`;
const nestedObject = balancedBraces(7);
const loneBrace = String.raw`\{(?![{%])|\}(?!\})`;
const wordToken = (pattern: RegExp): GrammarToken => ({
	pattern: new RegExp(`(^|[^\\w$])(?:${pattern.source})(?![\\w$])`),
	lookbehind: true,
});
const atoms: Grammar = {
	string,
	property: { pattern: new RegExp(`(\\.)\\s*${identifier}`), lookbehind: true },
	keyword: wordToken(keywords),
	boolean: wordToken(constants),
	number: wordToken(number),
	operator: [wordToken(wordOperators), operator],
	punctuation: /[()[\]{},.:]/,
};
const argumentsGrammar: Grammar = {
	...atoms,
	property: { pattern: new RegExp(`(\\.)\\s*${identifier}`), lookbehind: true, alias: 'string' },
	'bare-argument': { pattern: new RegExp(identifier), alias: 'string' },
};
const filterInside: Grammar = {
	operator: /^\|/,
	function: new RegExp(`${identifier}$`),
};
const filter: GrammarToken = {
	pattern: new RegExp(`\\|(?!\\|)\\s*${identifier}`),
	inside: filterInside,
};
const expressionBody = (end: string) => String.raw`(?:${quoted}|${nestedObject}|${loneBrace}|(?!${end}|\{[{%])[^{}"'])*`;

/** Prism 1 grammar for Knap tags in plain template text. */
export const knap: Grammar = {
	knap: {
		// One ordered alternation keeps comments and quoted delimiters isolated.
		pattern: new RegExp(String.raw`\{#[\s\S]*?(?:#\}|$)|\{\{-?${expressionBody('-?\\}\\}')}(?:-?\}\}|(?=\{[{%])|$)|\{%-?${expressionBody('-?%\\}')}(?:-?%\}|(?=\{[{%])|$)`),
		greedy: true,
		inside: {
			comment: /^\{#[\s\S]*/,
			'boolean-or': { pattern: /\|\|/, alias: 'operator' },
			'filter-with-arguments': {
				pattern: new RegExp(String.raw`\|(?!\|)\s*(?!map\b)${identifier}\s*:(?:${quoted}|(?!\|(?!\|)|-?\}\}|-?%\}|\{[{%])[^"'])*`),
				greedy: true,
				inside: {
					filter,
					punctuation: /:/,
					...argumentsGrammar,
				},
			},
			filter,
			'delimiter': { pattern: /^\{[{%]-?|-?[}%]\}$/, alias: 'punctuation' },
			...atoms,
			variable: new RegExp(identifier),
		},
	},
};

/** Register with the caller's Prism instance; importing this module has no side effects. */
export function registerKnap(prism: { languages: { [name: string]: unknown } }): void {
	prism.languages.knap = knap;
}

export default knap;
