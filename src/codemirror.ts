import syntax from './language-syntax.json';

type Filter = '' | 'name' | 'args' | 'map';
export interface KnapState {
	close: string;
	quote: string;
	filter: Filter;
	filterName: string;
	groups: { close: string; filter: Filter; filterName: string }[];
}

/** The small stream surface shared by CodeMirror 5 and CodeMirror 6. */
export interface KnapStream {
	string: string;
	pos: number;
}

const keywords = new Set(syntax.tags);
const operators = new Set(syntax.wordOperators);
const constants = new Set(syntax.constants);
const word = /[A-Za-z_$][\w$]*/y;
const number = /-?\d+(?:\.\d+)?\b/y;
const symbol = /=>|==|!=|>=|<=|&&|\|\||\?\?|[=<>!+*/-]/y;
const property = /\.\s*[A-Za-z_$][\w$]*/y;

function consume(stream: KnapStream, pattern: RegExp): string | undefined {
	pattern.lastIndex = stream.pos;
	const match = pattern.exec(stream.string);
	if (!match) return;
	stream.pos += match[0].length;
	return match[0];
}

/** A CM5-compatible stream parser, also accepted by CM6's StreamLanguage.define. */
export const knapStreamParser = {
	name: 'knap',
	startState: (): KnapState => ({ close: '', quote: '', filter: '', filterName: '', groups: [] }),
	copyState: (state: KnapState): KnapState => ({ ...state, groups: state.groups.map(group => ({ ...group })) }),
	languageData: { commentTokens: { block: { open: '{#', close: '#}' } } },
	blockCommentStart: '{#',
	blockCommentEnd: '#}',
	token(stream: KnapStream, state: KnapState): string | null {
		const source = stream.string;
		const starts = (value: string) => source.startsWith(value, stream.pos);
		if (state.close === '#}') {
			const end = source.indexOf('#}', stream.pos);
			stream.pos = end < 0 ? source.length : end + 2;
			if (end >= 0) state.close = '';
			return 'comment';
		}
		if (!state.quote && (starts('{{') || starts('{%') || (!state.close && starts('{#')))) {
			state.close = starts('{{') ? '}}' : starts('{%') ? '%}' : '#}';
			state.filter = ''; state.filterName = ''; state.groups = [];
			stream.pos += 2;
			if (state.close === '#}') {
				const end = source.indexOf('#}', stream.pos);
				stream.pos = end < 0 ? source.length : end + 2;
				if (end >= 0) state.close = '';
				return 'comment';
			}
			if (source[stream.pos] === '-') stream.pos++;
			return 'punctuation';
		}
		if (!state.close) {
			// Stop at the next opener so templates still work inside Markdown strings/code.
			do { stream.pos++; } while (stream.pos < source.length && !starts('{{') && !starts('{%') && !starts('{#'));
			return null;
		}
		if (!state.quote && (starts(state.close) || starts('-' + state.close))) {
			stream.pos += state.close.length + (source[stream.pos] === '-' ? 1 : 0);
			state.close = ''; state.filter = ''; state.filterName = ''; state.groups = [];
			return 'punctuation';
		}
		if (state.quote || starts('"') || starts("'")) {
			if (!state.quote) state.quote = source[stream.pos++];
			while (stream.pos < source.length) {
				const char = source[stream.pos++];
				if (char === '\\') stream.pos = Math.min(stream.pos + 1, source.length);
				else if (char === state.quote) { state.quote = ''; break; }
			}
			return 'string';
		}
		if (/\s/.test(source[stream.pos])) {
			do { stream.pos++; } while (stream.pos < source.length && /\s/.test(source[stream.pos]));
			return null;
		}
		if (starts('||')) { stream.pos += 2; return 'operator'; }
		if (starts('|')) { stream.pos++; state.filter = 'name'; state.filterName = ''; return 'operator'; }
		if (starts(':') && state.filter === 'name') {
			stream.pos++; state.filter = state.filterName === 'map' ? 'map' : 'args'; return 'punctuation';
		}
		const char = source[stream.pos];
		const close = ({ '(': ')', '[': ']', '{': '}' } as Record<string, string>)[char];
		if (close) {
			state.groups.push({ close, filter: state.filter, filterName: state.filterName });
			if (state.filter !== 'args') { state.filter = ''; state.filterName = ''; }
			stream.pos++; return 'punctuation';
		}
		if (state.groups.at(-1)?.close === char) {
			const group = state.groups.pop()!;
			state.filter = group.filter; state.filterName = group.filterName;
			stream.pos++; return 'punctuation';
		}
		if (consume(stream, property)) return state.filter === 'args' ? 'string' : 'property';
		if (consume(stream, number)) return 'number';
		if (consume(stream, symbol)) return 'operator';
		const name = consume(stream, word);
		if (name) {
			if (state.filter === 'name') { state.filterName = name; return 'variable-2'; }
			if (keywords.has(name)) return 'keyword';
			if (operators.has(name)) return 'operator';
			if (constants.has(name)) return 'atom';
			return state.filter === 'args' ? 'string' : 'variable';
		}
		stream.pos++; return 'punctuation';
	},
};

/** Register the stream parser and fence metadata with a CodeMirror 5 mode registry. */
export function registerKnap(codeMirror: {
	defineMode(name: string, factory: () => typeof knapStreamParser): void;
	defineMIME(mime: string, mode: string): void;
	modeInfo?: { name: string; mime?: string; mode: string; ext?: string[]; alias?: string[] }[];
}): void {
	codeMirror.defineMode('knap', () => knapStreamParser);
	codeMirror.defineMIME('text/x-knap', 'knap');
	if (codeMirror.modeInfo && !codeMirror.modeInfo.some(mode => mode.mode === 'knap')) {
		codeMirror.modeInfo.push({ name: 'Knap', mime: 'text/x-knap', mode: 'knap', ext: ['knap'], alias: ['knap'] });
	}
}
