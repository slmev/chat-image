<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="['toast', toast.type]"
        >
          <div class="toast-icon">
            <CheckCircle v-if="toast.type === 'success'" :size="18" />
            <AlertCircle v-else-if="toast.type === 'error'" :size="18" />
            <AlertTriangle v-else-if="toast.type === 'warning'" :size="18" />
            <Info v-else :size="18" />
          </div>
          <p class="toast-message">{{ toast.message }}</p>
          <button @click="removeToast(toast.id)" class="toast-close">
            <X :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-vue-next'
import { useToast } from '../../composables/useToast'

const { toasts, removeToast } = useToast()
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 400px;
}

.toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  min-width: 300px;
}

.toast.success {
  border-left: 4px solid var(--color-success);
}

.toast.error {
  border-left: 4px solid var(--color-error);
}

.toast.warning {
  border-left: 4px solid var(--color-warning);
}

.toast.info {
  border-left: 4px solid var(--color-primary);
}

.toast-icon {
  flex-shrink: 0;
}

.toast.success .toast-icon {
  color: var(--color-success);
}

.toast.error .toast-icon {
  color: var(--color-error);
}

.toast.warning .toast-icon {
  color: var(--color-warning);
}

.toast.info .toast-icon {
  color: var(--color-primary);
}

.toast-message {
  flex: 1;
  font-size: 14px;
  color: var(--color-text-primary);
}

.toast-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.toast-close:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

/* Transitions */
.toast-enter-active {
  transition: all var(--transition-slow);
}

.toast-leave-active {
  transition: all var(--transition-base);
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.toast-move {
  transition: transform var(--transition-base);
}

@media (max-width: 640px) {
  .toast-container {
    left: 20px;
    right: 20px;
    max-width: none;
  }

  .toast {
    min-width: auto;
  }
}
</style>
