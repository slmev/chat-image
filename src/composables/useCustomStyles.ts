import { ref } from 'vue'
import { getFromStorage, setToStorage, generateId } from '../utils/storage'
import { STORAGE_KEYS } from '../utils/constants'
import type { StyleTemplate } from '../types'

const customStyles = ref<StyleTemplate[]>(
  getFromStorage<StyleTemplate[]>(STORAGE_KEYS.CUSTOM_STYLES, []),
)

function save() {
  setToStorage(STORAGE_KEYS.CUSTOM_STYLES, customStyles.value)
}

export function useCustomStyles() {
  function addStyle(style: Omit<StyleTemplate, 'id'>): StyleTemplate {
    const newStyle: StyleTemplate = {
      ...style,
      id: `custom-${generateId()}`,
    }
    customStyles.value.push(newStyle)
    save()
    return newStyle
  }

  function updateStyle(id: string, updates: Partial<Omit<StyleTemplate, 'id'>>): void {
    const index = customStyles.value.findIndex((s) => s.id === id)
    if (index !== -1) {
      customStyles.value[index] = { ...customStyles.value[index], ...updates }
      save()
    }
  }

  function deleteStyle(id: string): void {
    customStyles.value = customStyles.value.filter((s) => s.id !== id)
    save()
  }

  function getStyleById(id: string): StyleTemplate | undefined {
    return customStyles.value.find((s) => s.id === id)
  }

  return {
    customStyles,
    addStyle,
    updateStyle,
    deleteStyle,
    getStyleById,
  }
}
