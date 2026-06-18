<script setup lang="ts">
import type { PromptTemplate } from '../../types'

interface Props {
  template: PromptTemplate
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [template: PromptTemplate]
}>()

function handleClick() {
  emit('select', props.template)
}
</script>

<template>
  <button
    @click="handleClick"
    class="prompt-card"
    :title="template.prompt"
  >
    <span class="card-title">{{ template.title }}</span>
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
