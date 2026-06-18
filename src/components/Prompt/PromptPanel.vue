<script setup lang="ts">
import { ref, computed } from 'vue'
import { Clock, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { usePromptSuggestions } from '../../composables/usePromptSuggestions'
import PromptCard from './PromptCard.vue'
import type { PromptCategory, PromptTemplate } from '../../types'

const { t } = useI18n()

const { categories, templatesByCategory, recentlyUsed, useTemplate, searchTemplates } = usePromptSuggestions()

const activeCategory = ref<PromptCategory | 'recent' | 'search'>('people')
const searchQuery = ref('')

const emit = defineEmits<{
  select: [prompt: string]
  close: []
}>()

const searchResults = computed(() => {
  if (!searchQuery.value.trim()) return []
  return searchTemplates(searchQuery.value)
})

const currentTemplates = computed(() => {
  if (searchQuery.value.trim()) {
    return searchResults.value
  }
  if (activeCategory.value === 'recent') {
    return recentlyUsed.value
  }
  return templatesByCategory(activeCategory.value as PromptCategory)
})

function handleSelect(template: PromptTemplate) {
  const prompt = useTemplate(template)
  emit('select', prompt)
  emit('close')
}

function handleSearch(event: Event) {
  const target = event.target as HTMLInputElement
  searchQuery.value = target.value
  if (target.value.trim()) {
    activeCategory.value = 'search'
  } else {
    activeCategory.value = 'people'
  }
}

function clearSearch() {
  searchQuery.value = ''
  activeCategory.value = 'people'
}
</script>

<template>
  <div class="prompt-panel">
    <!-- Header -->
    <div class="panel-header">
      <h3 class="panel-title">{{ t('promptTemplatesTitle') }}</h3>
      <button @click="$emit('close')" class="btn-icon" :aria-label="t('close')">
        <X :size="18" />
      </button>
    </div>

    <!-- Search -->
    <div class="search-wrapper">
      <input
        type="text"
        :value="searchQuery"
        @input="handleSearch"
        :placeholder="t('searchPrompts')"
        :aria-label="t('searchPrompts')"
        class="search-input"
      />
      <button v-if="searchQuery" @click="clearSearch" class="clear-search-btn" :aria-label="t('close')">
        <X :size="14" />
      </button>
    </div>

    <!-- Category Tabs -->
    <div class="category-tabs no-scrollbar">
      <button
        v-if="recentlyUsed.length > 0 && !searchQuery"
        @click="activeCategory = 'recent'"
        :class="['tab-btn', { active: activeCategory === 'recent' }]"
      >
        <Clock :size="14" />
        <span>{{ t('recentUsed') }}</span>
      </button>
      <button
        v-for="cat in categories"
        :key="cat.id"
        @click="activeCategory = cat.id"
        :class="['tab-btn', { active: activeCategory === cat.id && !searchQuery }]"
      >
        <span>{{ cat.name }}</span>
      </button>
    </div>

    <!-- Templates Grid -->
    <div class="templates-grid">
      <div v-if="currentTemplates.length === 0" class="empty-state">
        <p v-if="searchQuery">{{ t('noMatchingPrompts') }}</p>
        <p v-else-if="activeCategory === 'recent'">{{ t('noRecentUsage') }}</p>
      </div>
      <PromptCard
        v-for="template in currentTemplates"
        :key="template.id"
        :template="template"
        @select="handleSelect"
      />
    </div>
  </div>
</template>

<style scoped>
.prompt-panel {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  max-height: 400px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.search-wrapper {
  position: relative;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}

.search-input {
  width: 100%;
  padding: 10px 36px 10px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: 13px;
  outline: none;
  transition: all var(--transition-base);
}

.search-input:focus {
  background: var(--color-bg-primary);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.search-input::placeholder {
  color: var(--color-text-tertiary);
}

.clear-search-btn {
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-base);
}

.clear-search-btn:hover {
  color: var(--color-text-primary);
}

.category-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  overflow-x: auto;
  border-bottom: 1px solid var(--color-border);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-base);
}

.tab-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.tab-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  padding: 12px 16px;
  overflow-y: auto;
  max-height: 280px;
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

/* Mobile: bottom sheet */
@media (max-width: 640px) {
  .prompt-panel {
    max-height: 70vh;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .templates-grid {
    grid-template-columns: 1fr;
  }
}
</style>
