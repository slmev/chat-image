<script setup lang="ts">
import { Trash2, Star, RefreshCw, Download } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

interface Props {
  messageId: string
  isFavorite?: boolean
  hasImages?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isFavorite: false,
  hasImages: false,
})
const { t } = useI18n()

const emit = defineEmits<{
  delete: [messageId: string]
  toggleFavorite: [messageId: string]
  createVariation: [messageId: string]
  downloadAll: [messageId: string]
}>()

function handleDelete() {
  emit('delete', props.messageId)
}

function handleToggleFavorite() {
  emit('toggleFavorite', props.messageId)
}

function handleCreateVariation() {
  emit('createVariation', props.messageId)
}

function handleDownloadAll() {
  emit('downloadAll', props.messageId)
}
</script>

<template>
  <div class="message-actions">
    <button
      :class="['action-btn', { 'is-favorite': isFavorite }]"
      :title="isFavorite ? t('unfavorite') : t('favorite')"
      @click.stop="handleToggleFavorite"
    >
      <Star :size="14" :fill="isFavorite ? 'currentColor' : 'none'" />
    </button>

    <button
      v-if="hasImages"
      class="action-btn"
      :title="t('createVariation')"
      @click.stop="handleCreateVariation"
    >
      <RefreshCw :size="14" />
    </button>

    <button
      v-if="hasImages"
      class="action-btn"
      :title="t('downloadAll')"
      @click.stop="handleDownloadAll"
    >
      <Download :size="14" />
    </button>

    <button class="action-btn danger" :title="t('delete')" @click.stop="handleDelete">
      <Trash2 :size="14" />
    </button>
  </div>
</template>

<style scoped>
.message-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-base);
}

.message-actions:hover {
  opacity: 1 !important;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.action-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.action-btn.is-favorite {
  color: #f59e0b;
}

.action-btn.is-favorite:hover {
  color: #d97706;
}

.action-btn.danger:hover {
  background: #fef2f2;
  color: var(--color-error);
}

:root.dark .action-btn.danger:hover {
  background: #450a0a;
}
</style>
