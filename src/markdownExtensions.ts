import { marked, type Tokens } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import plaintext from 'highlight.js/lib/languages/plaintext'
import typescript from 'highlight.js/lib/languages/typescript'

interface CalloutToken extends Tokens.Generic {
  type: 'callout'
  variant: 'info' | 'warning' | 'danger' | 'success' | 'tip' | 'caution' | 'callout'
  title: string
  body: string
}

interface AccordionToken extends Tokens.Generic {
  type: 'accordion'
  body: string
}

interface AccordionItem {
  question: string
  answerHtml: string
}

const CALLOUT_PATTERN = /^:::(callout|info|warning|danger|success|tip|caution)(?:[ \t]*\n)?([\s\S]+?)\n:::(?:\n|$)/
const ACCORDION_PATTERN = /^:::accordion\s*\n([\s\S]+?)\n:::(?:\n|$)/

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('typescript', typescript)
hljs.registerAliases(['text', 'plain'], { languageName: 'plaintext' })

marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code, lang) {
    const normalized = normalizeLanguage(lang)
    if (normalized && hljs.getLanguage(normalized)) {
      try {
        return hljs.highlight(code, { language: normalized }).value
      } catch {
        // ignore highlight errors and fall back to escaped HTML
      }
    }

    return hljs.highlight(code, { language: 'plaintext' }).value
  }
}))

marked.use({
  extensions: [
    {
      name: 'callout',
      level: 'block',
      start(src) {
        const match = src.match(/^:::(callout|info|warning|danger|success|tip|caution)/m)
        return match ? src.indexOf(match[0]) : undefined
      },
      tokenizer(src) {
        const match = CALLOUT_PATTERN.exec(src)
        if (!match) {
          return undefined
        }

        const raw = match[0]
        const variant = match[1] as CalloutToken['variant']
        const body = match[2].trim()

        // Extract title from first line if it's bold
        let title = ''
        let actualBody = body
        const titleMatch = body.match(/^\*\*(.+?)\*\*\s*\n(.*)$/s)
        if (titleMatch) {
          title = titleMatch[1]
          actualBody = titleMatch[2]
        }

        const token: CalloutToken = {
          type: 'callout',
          raw,
          variant,
          title,
          body: actualBody
        }

        return token
      },
      renderer(token) {
        const calloutToken = token as CalloutToken
        const titleHtml = calloutToken.title ? `<strong>${escapeHtml(calloutToken.title)}</strong>` : ''
        const bodyHtml = (marked.parse(calloutToken.body, { async: false }) as string).trim()
        const transformedBody = transformCalloutBody(bodyHtml)
        const content = [titleHtml, transformedBody].filter(Boolean).join('\n')
        const className = calloutToken.variant === 'callout' ? 'callout' : `callout callout-${calloutToken.variant}`
        return `<div class="${className}">\n${content}\n</div>`
      }
    },
    {
      name: 'accordion',
      level: 'block',
      start(src) {
        const index = src.indexOf(':::accordion')
        return index === -1 ? undefined : index
      },
      tokenizer(src) {
        const match = ACCORDION_PATTERN.exec(src)
        if (!match) {
          return undefined
        }

        const raw = match[0]
        const body = match[1].trim()

        const token: AccordionToken = {
          type: 'accordion',
          raw,
          body
        }

        return token
      },
      renderer(token) {
        const accordionToken = token as AccordionToken
        const items = parseAccordionItems(accordionToken.body)
        if (items.length === 0) {
          return (marked.parse(accordionToken.body, { async: false }) as string).trim()
        }

        const itemsHtml = items
          .map(({ question, answerHtml }) => {
            const safeQuestion = escapeHtml(question)
            const content = answerHtml ? `\n<div class="accordion-content">\n${answerHtml}\n</div>` : ''
            return `<details class="accordion-item">\n<summary>${safeQuestion}</summary>${content}\n</details>`
          })
          .join('\n')

        return `<div class="accordion">\n${itemsHtml}\n</div>`
      }
    }
  ]
})

function parseAccordionItems(body: string): AccordionItem[] {
  const pattern = /^#{3,6}\s+(.+)\n([\s\S]*?)(?=^#{3,6}\s+|$)/gm
  const items: AccordionItem[] = []

  let match: RegExpExecArray | null = pattern.exec(body)
  while (match !== null) {
    const question = match[1].trim()
    const answer = match[2]?.trim() ?? ''

    if (!question) {
      continue
    }

    const answerHtml = answer ? (marked.parse(answer, { async: false }) as string).trim() : ''
    items.push({ question, answerHtml })
    match = pattern.exec(body)
  }

  return items
}

function transformCalloutBody(bodyHtml: string): string {
  const container = document.createElement('div')
  container.innerHTML = bodyHtml

  const fragments: string[] = []

  container.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement
      if (element.tagName === 'UL' || element.tagName === 'OL') {
        const keyIdeasHtml = renderKeyIdeas(element)
        if (keyIdeasHtml) {
          fragments.push(keyIdeasHtml)
        }
      } else {
        fragments.push(element.outerHTML)
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim()
      if (text) {
        fragments.push(`<p>${escapeHtml(text)}</p>`)
      }
    }
  })

  if (fragments.length === 0) {
    return bodyHtml
  }

  return fragments.join('\n')
}

function renderKeyIdeas(listElement: HTMLElement): string {
  const items = Array.from(listElement.children).filter((child) => child.tagName === 'LI') as HTMLLIElement[]
  if (items.length === 0) {
    return ''
  }

  const ideaHtml = items.map((item) => renderKeyIdea(item)).filter(Boolean).join('\n')
  if (!ideaHtml) {
    return ''
  }

  return `<div class="key-ideas">\n${ideaHtml}\n</div>`
}

function renderKeyIdea(listItem: HTMLLIElement): string {
  const clone = listItem.cloneNode(true) as HTMLLIElement
  const headingElement = clone.querySelector('strong')
  const headingText = headingElement?.textContent?.trim() ?? ''
  headingElement?.remove()

  normalizeLeadingText(clone)

  const segments: string[] = []

  clone.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement
      if (element.tagName === 'P') {
        normalizeLeadingText(element)
        element.innerHTML = element.innerHTML.replace(/^<br\s*\/?>(\s*)/i, '$1').trim()
        if (element.innerHTML) {
          segments.push(`<p>${element.innerHTML}</p>`)
        }
      } else if (element.tagName !== 'STRONG') {
        segments.push(element.outerHTML)
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim()
      if (text) {
        segments.push(`<p>${escapeHtml(text)}</p>`)
      }
    }
  })

  const content = segments.join('')
  const title = headingText ? `<h4>${escapeHtml(headingText)}</h4>` : ''

  if (!title && !content) {
    return ''
  }

  return `<div class="key-idea">\n${title}${content}\n</div>`
}

function normalizeLeadingText(element: HTMLElement): void {
  const firstChild = element.firstChild
  if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
    const textNode = firstChild
    const cleaned = textNode.textContent?.replace(/^[\s:–—-]+/, '') ?? ''
    if (cleaned) {
      textNode.textContent = cleaned
    } else {
      element.removeChild(textNode)
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return character
    }
  })
}

function normalizeLanguage(lang?: string | null): string | undefined {
  if (!lang) {
    return undefined
  }

  const lowerCased = lang.toLowerCase()
  if (lowerCased === 'text' || lowerCased === 'plain' || lowerCased === 'plaintext') {
    return 'plaintext'
  }

  return lowerCased
}
