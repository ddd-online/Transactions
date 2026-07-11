import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import sql from 'highlight.js/lib/languages/sql'
import bash from 'highlight.js/lib/languages/bash'
import javascript from 'highlight.js/lib/languages/javascript'
import go from 'highlight.js/lib/languages/go'
import python from 'highlight.js/lib/languages/python'
import 'highlight.js/styles/github.css'

// Register commonly needed languages
hljs.registerLanguage('json', json)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('go', go)
hljs.registerLanguage('python', python)

// Configure marked
marked.setOptions({
  gfm: true,
  breaks: false,
})

/**
 * Render Markdown text to safe HTML with syntax-highlighted code blocks.
 * Returns empty string for empty input.
 */
export function renderMarkdown(text: string): string {
  if (!text) return ''

  const raw = marked.parse(text) as string
  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'strong', 'em', 'del', 's',
      'a', 'img',
      'input',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'type', 'checked', 'disabled'],
  })

  // Apply syntax highlighting to code blocks
  const wrapper = document.createElement('div')
  wrapper.innerHTML = clean
  wrapper.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block as HTMLElement)
  })

  return wrapper.innerHTML
}
