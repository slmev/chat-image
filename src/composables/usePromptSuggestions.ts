import { ref, computed } from 'vue'
import { PROMPT_CATEGORIES, PROMPT_TEMPLATES } from '../utils/promptTemplates'
import { getFromStorage, setToStorage } from '../utils/storage'
import { STORAGE_KEYS } from '../utils/constants'
import type { PromptCategory, PromptTemplate, PromptCategoryInfo } from '../types'

const MAX_RECENT = 10

export function usePromptSuggestions() {
  const recentIds = ref<string[]>(getFromStorage<string[]>(STORAGE_KEYS.PROMPT_RECENT, []))

  // All categories
  const categories = computed<PromptCategoryInfo[]>(() => PROMPT_CATEGORIES)

  // All templates
  const templates = computed<PromptTemplate[]>(() => PROMPT_TEMPLATES)

  // Get templates by category
  function templatesByCategory(category: PromptCategory): PromptTemplate[] {
    return PROMPT_TEMPLATES.filter((t) => t.category === category)
  }

  // Search templates by query
  function searchTemplates(query: string): PromptTemplate[] {
    const q = query.trim().toLowerCase()
    if (!q) return []

    return PROMPT_TEMPLATES.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.prompt.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(q)),
    )
  }

  // Recently used templates
  const recentlyUsed = computed<PromptTemplate[]>(() => {
    return recentIds.value
      .map((id) => PROMPT_TEMPLATES.find((t) => t.id === id))
      .filter((t): t is PromptTemplate => t !== undefined)
  })

  // Use a template (add to recent)
  function useTemplate(template: PromptTemplate): string {
    const ids = [...recentIds.value]
    const existingIndex = ids.indexOf(template.id)

    // Remove if already exists (to move to front)
    if (existingIndex !== -1) {
      ids.splice(existingIndex, 1)
    }

    // Add to front
    ids.unshift(template.id)

    // Trim to max
    if (ids.length > MAX_RECENT) {
      ids.splice(MAX_RECENT)
    }

    recentIds.value = ids
    setToStorage(STORAGE_KEYS.PROMPT_RECENT, ids)

    return template.prompt
  }

  // Clear recent history
  function clearRecent(): void {
    recentIds.value = []
    setToStorage(STORAGE_KEYS.PROMPT_RECENT, [])
  }

  return {
    categories,
    templates,
    templatesByCategory,
    searchTemplates,
    recentlyUsed,
    useTemplate,
    clearRecent,
  }
}
