<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div v-if="isOpen" class="confirm-overlay" @click.self="handleCancel">
        <div
          ref="contentRef"
          class="confirm-content scale-in"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
        >
          <!-- Icon -->
          <div :class="['confirm-icon', type]">
            <AlertTriangle v-if="type === 'danger'" :size="24" />
            <AlertCircle v-else-if="type === 'warning'" :size="24" />
            <Info v-else :size="24" />
          </div>

          <!-- Content -->
          <div class="confirm-body">
            <h3 :id="titleId" class="confirm-title">{{ title }}</h3>
            <p class="confirm-message">{{ message }}</p>
          </div>

          <!-- Actions -->
          <div class="confirm-actions">
            <button class="btn-secondary" @click="handleCancel">
              {{ displayCancelText }}
            </button>
            <button :class="['btn-primary', type]" @click="handleConfirm">
              {{ displayConfirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, toRef, useId } from 'vue'
import { AlertTriangle, AlertCircle, Info } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useFocusTrap } from '../../composables/useFocusTrap'
import { useModalLayer } from '../../composables/useModalLayer'

interface Props {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
}

const props = withDefaults(defineProps<Props>(), {
  confirmText: '',
  cancelText: '',
  type: 'info',
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const titleId = `confirm-title-${useId()}`
const contentRef = ref<HTMLElement>()
const { t } = useI18n()
const displayConfirmText = computed(() => props.confirmText || t('confirm'))
const displayCancelText = computed(() => props.cancelText || t('cancel'))
useFocusTrap(contentRef, { isActive: toRef(props, 'isOpen') })
useModalLayer(toRef(props, 'isOpen'), handleCancel)

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--color-text-primary) 32%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
  backdrop-filter: blur(10px) saturate(1.2);
  -webkit-backdrop-filter: blur(10px) saturate(1.2);
}

.confirm-content {
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  padding: 26px 24px;
  max-width: 400px;
  width: 100%;
  box-shadow: var(--glass-shadow);
  text-align: center;
}

.confirm-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.confirm-icon.danger {
  background: #fef2f2;
  color: var(--color-error);
}

.confirm-icon.warning {
  background: #fffbeb;
  color: var(--color-warning);
}

.confirm-icon.info {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.confirm-body {
  margin-bottom: 24px;
}

.confirm-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.confirm-message {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.confirm-actions .btn-primary.danger {
  background: var(--color-error);
}

.confirm-actions .btn-primary.danger:hover {
  background: #dc2626;
}

/* Transitions */
.confirm-enter-active,
.confirm-leave-active {
  transition: all var(--transition-base);
}

.confirm-enter-from,
.confirm-leave-to {
  opacity: 0;
}

.confirm-enter-from .confirm-content,
.confirm-leave-to .confirm-content {
  transform: scale(0.95);
}
</style>
