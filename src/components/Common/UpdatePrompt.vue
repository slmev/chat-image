<template>
  <Transition name="slide-up">
    <div v-if="needRefresh" class="update-prompt" role="alert">
      <div class="update-content">
        <Download :size="18" />
        <span>{{ t('updateAvailable') }}</span>
      </div>
      <button @click="handleUpdate" class="btn-primary update-btn">
        {{ t('update') }}
      </button>
      <button @click="close" class="btn-icon" :aria-label="t('close')">
        <X :size="16" />
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { Download, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useRegisterSW } from 'virtual:pwa-register/vue'

const { t } = useI18n()

const { needRefresh, updateServiceWorker } = useRegisterSW()

function handleUpdate() {
  updateServiceWorker(true)
}

function close() {
  needRefresh.value = false
}
</script>

<style scoped>
.update-prompt {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  z-index: 200;
}

.update-content {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
}

.update-btn {
  padding: 6px 14px;
  font-size: 13px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all var(--transition-slow);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}
</style>
