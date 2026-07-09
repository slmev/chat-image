<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="isOpen" class="dialog-overlay" @click.self="requestClose">
        <div ref="dialogContentRef" class="dialog-content scale-in" role="dialog" aria-modal="true">
          <!-- Header -->
          <div class="dialog-header">
            <h2 class="dialog-title">{{ isEditing ? t('editStyle') : t('createStyle') }}</h2>
            <button class="btn-icon" :aria-label="t('close')" @click="requestClose">
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
            <button v-if="isEditing" class="btn-ghost danger" @click="handleDelete">
              {{ t('delete') }}
            </button>
            <div class="footer-spacer"></div>
            <button class="btn-secondary" @click="requestClose">
              {{ t('cancel') }}
            </button>
            <button
              :disabled="!form.name.trim() || !form.promptSuffix.trim()"
              class="btn-primary"
              @click="handleSave"
            >
              {{ t('save') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Unsaved Changes Confirm -->
    <ConfirmModal
      :is-open="showUnsavedConfirm"
      :title="t('unsavedChanges')"
      :message="t('unsavedChangesConfirm')"
      :confirm-text="t('discard')"
      type="danger"
      @confirm="confirmDiscard"
      @cancel="cancelDiscard"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useFocusTrap } from '../../composables/useFocusTrap'
import { useModalLayer } from '../../composables/useModalLayer'
import ConfirmModal from '../Common/ConfirmModal.vue'
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
const dialogContentRef = ref<HTMLElement>()

const form = ref({
  name: '',
  description: '',
  promptSuffix: '',
  icon: 'sparkles',
})
// 打开时的表单快照，用于判断是否有未保存改动（L1）。
const initialSnapshot = ref('')
const showUnsavedConfirm = ref(false)
const isDialogTrapActive = computed(() => props.isOpen && !showUnsavedConfirm.value)
useFocusTrap(dialogContentRef, { isActive: isDialogTrapActive })
useModalLayer(isDialogTrapActive, requestClose)

function snapshot() {
  return JSON.stringify(form.value)
}

const isDirty = computed(() => snapshot() !== initialSnapshot.value)

watch(
  () => props.isOpen,
  (open) => {
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
    if (open) {
      initialSnapshot.value = snapshot()
      showUnsavedConfirm.value = false
    }
  },
)

function handleSave() {
  if (!form.value.name.trim() || !form.value.promptSuffix.trim()) return
  emit('save', { ...form.value })
  emit('close')
}

function handleDelete() {
  emit('delete')
  emit('close')
}

// 关闭前拦截：有未保存改动时先弹二次确认。
function requestClose() {
  if (isDirty.value) {
    showUnsavedConfirm.value = true
    return
  }
  emit('close')
}

function confirmDiscard() {
  showUnsavedConfirm.value = false
  emit('close')
}

function cancelDiscard() {
  showUnsavedConfirm.value = false
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 22, 0.58);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.dialog-content {
  width: 100%;
  max-width: 480px;
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--glass-shadow);
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
