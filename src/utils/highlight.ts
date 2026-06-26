export interface HighlightSegment {
  text: string
  isMatch: boolean
}

/**
 * 将文本按匹配的关键词拆分为片段，匹配段标记 isMatch=true 以便渲染 <mark>
 */
export function highlightText(text: string, query: string): HighlightSegment[] {
  if (!query.trim()) return [{ text, isMatch: false }]

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)

  return parts
    .filter(part => part !== '')
    .map(part => ({
      text: part,
      isMatch: part.toLowerCase() === query.toLowerCase(),
    }))
}
