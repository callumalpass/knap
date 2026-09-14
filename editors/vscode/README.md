# Knap

Syntax highlighting and snippets for [Knap](https://github.com/obsidianmd/knap), a template language for creating Markdown.

Download `knap.vsix` from the [latest Knap release](https://github.com/obsidianmd/knap/releases/latest), then choose **Extensions: Install from VSIX** from the command palette.

Use `.knap` for Knap templates. The extension also recognizes `.knap.md`, or you can select **Knap Markdown** as the language mode for an existing template. Markdown formatting is preserved around expressions:

```knap
# {{ title | trim }}

{% if author %}
By {{ author.name }}
{% endif %}

{% for tag in tags %}
- #{{ tag | kebab }}
{% endfor %}

{# Comments are removed from the rendered output. #}
```

Type `knap-` to find snippets for variables, filters, conditions, loops, assignments, and comments. Use the editor's block-comment command to toggle `{# ... #}`. Template delimiters, parentheses, brackets, and quotes support pairing and selection wrapping.

To select Knap for an existing template folder, use workspace settings:

```json
{
  "files.associations": {
    "templates/*.md": "knap"
  }
}
```

This extension supplies highlighting and editing basics. It does not execute templates, validate them, or provide a rendered preview. Bare filter arguments use the same string coloring convention as the Knap website; they can still resolve to variables at runtime. Markdown-specific extensions may require the `markdown` language mode to activate their features.

Development and installation instructions are in the repository's [editor support guide](https://github.com/obsidianmd/knap/tree/main/editors).
