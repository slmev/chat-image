<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="isOpen" class="dialog-overlay" @click.self="$emit('close')">
        <div class="dialog-content scale-in" role="dialog" aria-modal="true">
          <!-- Header -->
          <div class="dialog-header">
            <h2 class="dialog-title">{{ isEditing ? t('editStyle') : t('createStyle') }}</h2>
            <button @click="$emit('close')" class="btn-icon" :aria-label="t('close')">
              <X :size="20" />
            </button>
          </div>

          <!-- Body -->
          <div class="dialog-body">
            <div class="form-group">
              <label class="form-label" for="style-name">{{ t('styleName') }}</label>
              <input
                id="style-name"
                v-model="form.name"
                type="text"
                :placeholder="t('styleNamePlaceholder')"
                class="input-field"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="style-desc">{{ t('styleDesc') }}</label>
              <input
                id="style-desc"
                v-model="form.description"
                type="text"
                :placeholder="t('styleDescPlaceholder')"
                class="input-field"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="style-suffix">{{ t('stylePromptSuffix') }}</label>
              <textarea
                id="style-suffix"
                v-model="form.promptSuffix"
                :placeholder="t('styleSuffixPlaceholder')"
                rows="3"
                class="input-field"
              />
              <p class="form-hint">{{ t('styleSuffixHint') }}</p>
            </div>
          </div>

          <!-- Footer -->
          <div class="dialog-footer">
            <button v-if="isEditing" @click="handleDelete" class="btn-ghost danger">
              {{ t('delete') }}
            </button>
            <div class="footer-spacer"></div>
            <button @click="$emit('close')" class="btn-secondary">
              {{ t('cancel') }}
            </button>
            <button
              @click="handleSave"
              :disabled="!form.name.trim() || !form.promptSuffix.trim()"
              class="btn-primary"
            >
              {{ t('save') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { StyleTemplate } from '../../types'

const { t } = useI18n()

interface Props {
  isOpen: boolean
  editingStyle?: StyleTemplate | null
}

const props = withDefaults(defineProps<Props>(), {
  editingStyle: null,
})

const emit = defineEmits<{
  close: []
  save: [style: Omit<StyleTemplate, 'id'>]
  delete: []
}>()

const isEditing = ref(false)

const form = ref({
  name: '',
  description: '',
  promptSuffix: '',
  icon: 'sparkles',
})

watch(() => props.isOpen, (open) => {
  if (open && props.editingStyle) {
    isEditing.value = true
    form.value = {
      name: props.editingStyle.name,
      description: props.editingStyle.description,
      promptSuffix: props.editingStyle.promptSuffix,
      icon: props.editingStyle.icon,
    }
  } else {
    isEditing.value = false
    form.value = { name: '', description: '', promptSuffix: '', icon: 'sparkles' }
  }
})

function handleSave() {
  if (!form.value.name.trim() || !form.value.promptSuffix.trim()) return
  emit('save', { ...form.value })
  emit('close')
}

function handleDelete() {
  emit('delete')
  emit('close')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
  backdrop-filter: blur(4px);
}

.dialog-content {
  width: 100%;
  max-width: 480px;
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.dialog-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.form-hint {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.dialog-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.footer-spacer {
  flex: 1;
}

.btn-ghost.danger {
  color: var(--color-error);
}

.btn-ghost.danger:hover {
  background: #fef2f2;
}

:root.dark .btn-ghost.danger:hover {
  background: #450a0a;
}

.dialog-enter-active,
.dialog-leave-active {
  transition: all var(--transition-slow);
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .dialog-content,
.dialog-leave-to .dialog-content {
  transform: scale(0.95);
}
</style>
