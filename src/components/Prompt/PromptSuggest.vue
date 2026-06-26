<template>
  <div v-if="visible" class="suggest-panel">
    <!-- Enhancement Suggestions -->
    <div v-if="enhancers.length > 0" class="suggest-section">
      <div
        v-for="group in enhancers"
        :key="group.category"
        class="enhancer-group"
      >
        <span class="group-label">{{ enhancerLabel(group.category, group.label) }}</span>
        <div class="group-chips">
          <button
            v-for="keyword in group.suggestions"
            :key="keyword"
            @click="$emit('add', keyword)"
            class="chip"
          >
            + {{ keyword }}
          </button>
        </div>
      </div>
    </div>

    <!-- Template Matches -->
    <div v-if="templateMatches.length > 0" class="suggest-section">
      <span class="section-label">{{ t('promptTemplatesTitle') }}</span>
      <button
        v-for="tmpl in templateMatches"
        :key="tmpl.id"
        @click="$emit('use-template', tmpl.prompt)"
        class="template-item"
      >
        <span class="template-title">{{ promptTemplateTitle(tmpl) }}</span>
        <span class="template-preview">{{ tmpl.prompt.length > 60 ? tmpl.prompt.slice(0, 60) + '...' : tmpl.prompt }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { PromptTemplate } from '../../types'

const { t } = useI18n()

interface Props {
  visible: boolean
  enhancers: { category: string; label: string; suggestions: string[] }[]
  templateMatches: PromptTemplate[]
}

defineProps<Props>()

defineEmits<{
  add: [keyword: string]
  'use-template': [prompt: string]
}>()

function enhancerLabel(category: string, fallback: string): string {
  const keys: Record<string, string> = {
    lighting: 'enhancerLighting',
    style: 'enhancerStyle',
    quality: 'enhancerQuality',
    mood: 'enhancerMood',
    composition: 'enhancerComposition',
    color: 'enhancerColor',
  }
  return keys[category] ? t(keys[category]) : fallback
}

function promptTemplateTitle(template: PromptTemplate): string {
  const sep = template.id.lastIndexOf('-')
  if (sep <= 0) return template.title
  const category = template.id.slice(0, sep)
  const index = template.id.slice(sep + 1)
  if (!index) return template.title
  const key = `promptTemplate${category[0].toUpperCase()}${category.slice(1)}${index}`
  return t(key)
}
</script>

<style scoped>
.suggest-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 4px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  max-height: 240px;
  overflow-y: auto;
  z-index: 10;
}

.suggest-section {
  padding: 10px 12px;
}

.suggest-section + .suggest-section {
  border-top: 1px solid var(--color-border);
}

.section-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.enhancer-group {
  margin-bottom: 8px;
}

.enhancer-group:last-child {
  margin-bottom: 0;
}

.group-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  margin-bottom: 4px;
}

.group-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chip {
  padding: 3px 8px;
  font-size: 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.chip:hover {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.template-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast);
}

.template-item:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border);
}

.template-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.template-preview {
  font-size: 11px;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
