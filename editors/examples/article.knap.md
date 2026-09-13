---
title: "{{ title | trim }}"
source: "{{ url }}"
{{ tags | yaml_property:"tags" }}
---

# {{ title | trim }}

{# This comment spans multiple lines.
   {{ ignored }} and {% if ignored %} are not evaluated here.
#}

{% if author %}
By **{{ author.name }}**
{% elseif site %}
From [{{ site }}]({{ url }})
{% else %}
Unknown source
{% endif %}

{% set heading = title | upper %}
{{ published | date:"YYYY-MM-DD" }}
{{ First name | trim }}
{{ summary ?? "No summary" }}

{% for tag in tags %}
- #{{ tag | kebab }}
{% endfor %}

{{ text | highlight:blue }}
{{ people | sort:(details.rank, desc) }}
{{ people | map:item => ({name: item.name}) | first }}

Inline code: `{{ title }}`

```text
{{ content }}
```

<a href="{{ url }}">{{ title }}</a>

{{- "Literal delimiters: {# comment #} and }}" -}}
