import syntax from '../../../src/language-syntax.json';

// Shared with the generated desktop editor grammars. Keep each renderer's
// colors and state handling here in the website.
export const knapKeyword = new RegExp(`^(?:${[...syntax.tags, ...syntax.wordOperators].join('|')})$`);
export const knapConstant = new RegExp(`^(?:${syntax.constants.join('|')})$`);
