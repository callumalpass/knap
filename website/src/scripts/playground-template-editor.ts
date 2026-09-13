import { maxHighlightLineLength } from '../lib/playground-limits';
import { EditorView, keymap } from '@codemirror/view';
import { autocompletion, completionKeymap, acceptCompletion } from '@codemirror/autocomplete';
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { templateCompletions, type TemplateSuggestion } from '../lib/playground-completions';
import { emptyTemplatePair, pairTemplateInput } from '../lib/playground-pairs';
import { markdownPunctuationAt } from '../lib/markdown-punctuation';
import { knapStreamParser } from '../../../src/codemirror';
import { createPlaygroundEditor } from './playground-editor';

export const templateLanguage = StreamLanguage.define({
  ...knapStreamParser,
  token(stream, state) {
    if (stream.string.length > maxHighlightLineLength) {
      stream.skipToEnd();
      Object.assign(state, knapStreamParser.startState());
      return null;
    }
    // Keep the website's Markdown punctuation styling around the shared parser.
    if (!state.close && !/^\{[{%#]/.test(stream.string.slice(stream.pos))) {
      const length = markdownPunctuationAt(stream.string, stream.pos);
      if (length) { stream.pos += length; return 'punctuation'; }
      stream.next();
      return null;
    }
    return knapStreamParser.token(stream, state);
  },
});

export const templateHighlightStyle = HighlightStyle.define([
  { tag: tags.variableName, class: 'syn-variable' },
  { tag: tags.propertyName, class: 'syn-variable' },
  { tag: tags.special(tags.variableName), class: 'syn-filter' },
  { tag: tags.keyword, class: 'syn-keyword' },
  { tag: tags.atom, class: 'syn-keyword' },
  { tag: tags.string, class: 'syn-string' },
  { tag: tags.number, class: 'syn-number' },
  { tag: tags.comment, class: 'syn-comment' },
  { tag: [tags.punctuation, tags.operator], class: 'syn-punctuation' },
]);

export function createTemplateEditor(variables: () => Record<string, unknown>, wrap = false) {
  const filters: TemplateSuggestion[] = JSON.parse(document.getElementById('playground-filter-completions')!.textContent!);
  return createPlaygroundEditor('template', [
    templateLanguage,
    EditorView.inputHandler.of((view, from, to, text, insert) => {
      if (view.composing || view.state.selection.ranges.length !== 1 || !insert().isUserEvent('input.type')) return false;
      const paired = pairTemplateInput(view.state.doc.toString(), from, to, text);
      if (!paired) return false;
      view.dispatch({
        changes: { from: paired.from, to: paired.to, insert: paired.insert },
        selection: { anchor: paired.anchor },
        userEvent: paired.insert ? 'input.type' : 'select',
        scrollIntoView: true,
      });
      return true;
    }),
    syntaxHighlighting(templateHighlightStyle),
    autocompletion({
      icons: false,
      optionClass: (completion) => {
        if (completion.type === 'variable' || completion.type === 'property') return 'playground-completion-variable';
        if (completion.type === 'function') return 'playground-completion-filter';
        if (completion.type === 'enum') return 'playground-completion-parameter';
        return completion.type === 'keyword' ? 'playground-completion-keyword' : '';
      },
      activateOnTypingDelay: 80,
      override: [(context) => templateCompletions(context.state.doc.toString(), context.pos, variables(), filters)],
    }),
    keymap.of([...completionKeymap, { key: 'Tab', run: acceptCompletion }, {
      key: 'Backspace',
      run(view) {
        if (!view.state.selection.main.empty || view.state.selection.ranges.length !== 1) return false;
        const pair = emptyTemplatePair(view.state.doc.toString(), view.state.selection.main.head);
        if (!pair) return false;
        view.dispatch({ changes: pair, selection: { anchor: pair.from }, userEvent: 'delete.backward' });
        return true;
      },
    }]),
  ], wrap);
}
