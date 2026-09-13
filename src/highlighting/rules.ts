import syntax from '../language-syntax.json';

export const identifier = '[A-Za-z_$][\\w$]*';
export const words = (values: string[]) => new RegExp(`\\b(?:${values.join('|')})\\b(?!\\$)`);
export const keywords = words(syntax.tags);
export const wordOperators = words(syntax.wordOperators);
export const constants = words(syntax.constants);
export const operator = /=>|==|!=|>=|<=|&&|\|\||\?\?|[|=<>!+*/-]/;
export const number = /-?\d+(?:\.\d+)?\b/;
// Consume escapes before checking quotes, including strings spanning lines.
export const quoted = String.raw`"(?:\\[\s\S]|[^"\\])*(?:"|$)|'(?:\\[\s\S]|[^'\\])*(?:'|$)`;
