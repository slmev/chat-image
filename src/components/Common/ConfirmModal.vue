<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div v-if="isOpen" class="confirm-overlay" @click.self="handleCancel">
        <div class="confirm-content scale-in" role="dialog" aria-modal="true" :aria-labelledby="titleId">
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
            <button
              @click="handleCancel"
              class="btn-secondary"
              ref="cancelBtn"
            >
              {{ cancelText }}
            </button>
            <button
              @click="handleConfirm"
              :class="['btn-primary', type]"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, useId } from 'vue'
import { AlertTriangle, AlertCircle, Info } from 'lucide-vue-next'

interface Props {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
}

const props = withDefaults(defineProps<Props>(), {
  confirmText: '确认',
  cancelText: '取消',
  type: 'info',
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const titleId = `confirm-title-${useId()}`
const cancelBtn = ref<HTMLButtonElement>()

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    handleCancel()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  // 聚焦到取消按钮
  cancelBtn.value?.focus()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.confirm-overlay {
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

.confirm-content {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  padding: 24px;
  max-width: 400px;
  width: 100%;
  box-shadow: var(--shadow-xl);
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
