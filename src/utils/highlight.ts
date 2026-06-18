import { h, type VNode } from 'vue'

/**
 * 将文本中匹配的关键词用 <mark> 包裹
 */
export function highlightText(text: string, query: string): (string | VNode)[] {
  if (!query.trim()) return [text]

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)

  return parts.map(part => {
    if (part.toLowerCase() === query.toLowerCase()) {
      return h('mark', { class: 'search-highlight' }, part)
    }
    return part
  })
}
