<script setup lang="ts">
import { Brush, Eraser, Undo2, Trash2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

interface Props {
  brushSize: number
  isEraser: boolean
}

const props = defineProps<Props>()
const { t } = useI18n()

const emit = defineEmits<{
  'update:brushSize': [value: number]
  'update:isEraser': [value: boolean]
  undo: []
  clear: []
}>()

function toggleEraser() {
  emit('update:isEraser', !props.isEraser)
}

function handleBrushSizeChange(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:brushSize', parseInt(target.value))
}
</script>

<template>
  <div class="edit-toolbar">
    <button :class="['tool-btn', { active: !isEraser }]" :title="t('brush')" @click="toggleEraser">
      <Brush :size="16" />
    </button>
    <button :class="['tool-btn', { active: isEraser }]" :title="t('eraser')" @click="toggleEraser">
      <Eraser :size="16" />
    </button>

    <div class="divider"></div>

    <div class="brush-size-control">
      <label class="size-label">{{ t('brushSize') }}:</label>
      <input
        type="range"
        :value="brushSize"
        min="5"
        max="50"
        class="size-slider"
        @input="handleBrushSizeChange"
      />
      <span class="size-value">{{ brushSize }}px</span>
    </div>

    <div class="divider"></div>

    <button class="tool-btn" :title="t('undo')" @click="$emit('undo')">
      <Undo2 :size="16" />
    </button>
    <button class="tool-btn danger" :title="t('clearMask')" @click="$emit('clear')">
      <Trash2 :size="16" />
    </button>
  </div>
</template>

<style scoped>
.edit-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.tool-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.tool-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.tool-btn.danger:hover {
  background: #fef2f2;
  color: var(--color-error);
}

:root.dark .tool-btn.danger:hover {
  background: #450a0a;
}

.divider {
  width: 1px;
  height: 20px;
  background: var(--color-border);
}

.brush-size-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.size-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.size-slider {
  width: 80px;
  height: 4px;
  appearance: none;
  background: var(--color-border);
  border-radius: 2px;
  outline: none;
}

.size-slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  background: var(--color-primary);
  border-radius: 50%;
  cursor: pointer;
}

.size-value {
  font-size: 11px;
  color: var(--color-text-secondary);
  min-width: 32px;
  text-align: right;
}
</style>
