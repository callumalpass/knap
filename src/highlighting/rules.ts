import syntax from '../language-syntax.json';

export const tagNames = syntax.tags;
export const wordOperatorNames = syntax.wordOperators;
export const constantNames = syntax.constants;
export const identifier = '[A-Za-z_$][\\w$]*';
export const words = (values: string[]) => new RegExp(`\\b(?:${values.join('|')})\\b(?!\\$)`);
export const keywords = words(tagNames);
export const wordOperators = words(wordOperatorNames);
export const constants = words(constantNames);
export const operator = /=>|==|!=|>=|<=|&&|\|\||\?\?|[|=<>!+*/-]/;
export const number = /-?\d+(?:\.\d+)?\b/;
// Consume escapes before checking quotes, including strings spanning lines.
export const quoted = String.raw`"(?:\\[\s\S]|[^"\\])*(?:"|$)|'(?:\\[\s\S]|[^'\\])*(?:'|$)`;
