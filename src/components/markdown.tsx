import type { JSX, ReactNode } from 'react'

export interface MarkdownProps {
  source: string
  testId?: string
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g
  const parts: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  let index = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index))
    const token = match[0]
    const key = `${keyPrefix}-i${index++}`
    if (token.startsWith('**')) parts.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`')) parts.push(<code key={key}>{token.slice(1, -1)}</code>)
    else if (token.startsWith('[')) parts.push(
      <a key={key} href={match[2]} target="_blank" rel="noreferrer noopener">
        {token.slice(1, token.indexOf(']'))}
      </a>,
    )
    else parts.push(<em key={key}>{token.slice(1, -1)}</em>)
    cursor = match.index + token.length
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}

/** 轻量安全 Markdown 渲染：标题 / 列表 / 代码 / 粗斜体 / https 链接。 */
export function Markdown({ source, testId }: MarkdownProps): JSX.Element {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0
  let block = 0
  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === '') {
      index += 1
      continue
    }
    if (line.startsWith('```')) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push(
        <pre key={`b${block++}`}>
          <code>{code.join('\n')}</code>
        </pre>,
      )
      continue
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const content = inline(heading[2], `h${block}`)
      blocks.push(
        level === 1 ? (
          <h1 key={`b${block++}`}>{content}</h1>
        ) : level === 2 ? (
          <h2 key={`b${block++}`}>{content}</h2>
        ) : (
          <h3 key={`b${block++}`}>{content}</h3>
        ),
      )
      index += 1
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      const items: ReactNode[] = []
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(
          <li key={`li${index}`}>{inline(lines[index].replace(/^[-*]\s+/, ''), `l${index}`)}</li>,
        )
        index += 1
      }
      blocks.push(<ul key={`b${block++}`}>{items}</ul>)
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: ReactNode[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(
          <li key={`li${index}`}>{inline(lines[index].replace(/^\d+\.\s+/, ''), `o${index}`)}</li>,
        )
        index += 1
      }
      blocks.push(<ol key={`b${block++}`}>{items}</ol>)
      continue
    }
    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !/^(#{1,3})\s+/.test(lines[index]) &&
      !/^[-*]\s+/.test(lines[index]) &&
      !/^\d+\.\s+/.test(lines[index]) &&
      !lines[index].startsWith('```')
    ) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push(<p key={`b${block++}`}>{inline(paragraph.join('\n'), `p${block}`)}</p>)
  }
  return (
    <div className="md-body" data-testid={testId}>
      {blocks}
    </div>
  )
}
