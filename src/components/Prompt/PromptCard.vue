<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { PromptTemplate } from '../../types'

interface Props {
  template: PromptTemplate
}

const props = defineProps<Props>()
const { t } = useI18n()

const emit = defineEmits<{
  select: [template: PromptTemplate]
}>()

function handleClick() {
  emit('select', props.template)
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

<template>
  <button class="prompt-card" :title="template.prompt" @click="handleClick">
    <span class="card-title">{{ promptTemplateTitle(template) }}</span>
    <p class="card-preview">{{ template.prompt }}</p>
  </button>
</template>

<style scoped>
.prompt-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-base);
  width: 100%;
}

.prompt-card:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.card-preview {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
