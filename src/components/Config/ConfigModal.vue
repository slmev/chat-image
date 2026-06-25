<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content scale-in" role="dialog" aria-modal="true" :aria-label="t('apiConfig')">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title-section">
          <div class="modal-icon" aria-hidden="true">
            <Settings :size="20" />
          </div>
          <h2 class="modal-title">{{ t('apiConfig') }}</h2>
        </div>
        <button @click="$emit('close')" class="btn-icon" :aria-label="t('close')">
          <X :size="20" />
        </button>
      </div>

      <!-- Body -->
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="endpoint">{{ t('apiEndpoint') }}</label>
          <input
            id="endpoint"
            v-model="localConfig.endpoint"
            type="text"
            :placeholder="t('endpointPlaceholder')"
            class="input-field"
          />
          <p class="form-hint">{{ t('endpointHint') }}</p>
        </div>

        <div class="form-group">
          <label class="form-label" for="apiKey">{{ t('apiKey') }}</label>
          <div class="password-input">
            <input
              id="apiKey"
              v-model="localConfig.apiKey"
              :type="showApiKey ? 'text' : 'password'"
              :placeholder="t('apiKeyPlaceholder')"
              class="input-field"
            />
            <button
              @click="showApiKey = !showApiKey"
              class="toggle-visibility"
              type="button"
              :aria-label="showApiKey ? t('hideApiKey') : t('showApiKey')"
            >
              <EyeOff v-if="showApiKey" :size="16" />
              <Eye v-else :size="16" />
            </button>
          </div>
          <p class="form-hint">{{ t('apiKeyHint') }}</p>
        </div>

        <div class="form-group">
          <label class="form-label" for="model">{{ t('model') }}</label>
          <input
            id="model"
            v-model="localConfig.model"
            type="text"
            :placeholder="t('modelPlaceholder')"
            class="input-field"
          />
        </div>

        <!-- Test Result -->
        <Transition name="slide-up">
          <div v-if="testResult" :class="['test-result', testResult.success ? 'success' : 'error']" role="alert">
            <component :is="testResult.success ? CheckCircle : AlertCircle" :size="18" />
            <span>{{ testResult.message }}</span>
          </div>
        </Transition>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <div class="footer-spacer"></div>
        <button
          @click="handleTest"
          class="btn-secondary"
          :disabled="!isFormValid || isTesting"
        >
          <Loader2 v-if="isTesting" :size="16" class="spin" />
          <Zap v-else :size="16" />
          <span>{{ isTesting ? t('testing') : t('testConnection') }}</span>
        </button>
        <button
          @click="handleSave"
          class="btn-primary"
          :disabled="!isFormValid"
        >
          <Save :size="16" />
          <span>{{ t('saveConfig') }}</span>
        </button>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Save,
  Settings,
  X,
  Zap,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useConfig } from '../../composables/useConfig'
import type { ApiConfig } from '../../types'

const { t } = useI18n()

const emit = defineEmits<{
  close: []
}>()

const { configStore, testApiConnection, initializeConfig } = useConfig()

const localConfig = ref<ApiConfig>(initializeConfig())
const isTesting = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)
const showApiKey = ref(false)

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

const isFormValid = computed(() => {
  return (
    localConfig.value.endpoint.trim() !== '' &&
    localConfig.value.apiKey.trim() !== '' &&
    localConfig.value.model.trim() !== ''
  )
})

async function handleSave() {
  if (isFormValid.value) {
    try {
      await configStore.saveConfig(localConfig.value)
      testResult.value = { success: true, message: t('configSaved') }
      setTimeout(() => {
        emit('close')
      }, 1000)
    } catch (error) {
      console.error('Save config failed:', error)
      testResult.value = { success: false, message: t('unknownError') }
    }
  }
}

async function handleTest() {
  if (!isFormValid.value) return

  isTesting.value = true
  testResult.value = null

  try {
    const result = await testApiConnection(localConfig.value)
    testResult.value = result
  } catch (error) {
    console.error('API connection test failed:', error)
    testResult.value = { success: false, message: t('unknownError') }
  } finally {
    isTesting.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 20px;
  backdrop-filter: blur(4px);
}

.modal-content {
  width: 100%;
  max-width: 480px;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.modal-title-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-light);
  border-radius: var(--radius-md);
  color: var(--color-primary);
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
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

.password-input {
  position: relative;
}

.password-input .input-field {
  padding-right: 44px;
}

.toggle-visibility {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-base);
}

.toggle-visibility:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.test-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
}

.test-result.success {
  background: #ecfdf5;
  color: #059669;
}

.test-result.error {
  background: #fef2f2;
  color: #dc2626;
}

.storage-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-secondary);
}

.storage-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.storage-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.btn-secondary.compact {
  min-height: 32px;
  padding: 6px 10px;
  font-size: 12px;
  flex-shrink: 0;
}

.storage-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.storage-stat {
  min-width: 0;
  padding: 10px;
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
}

.storage-label {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.storage-stat strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
}

.storage-path-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
}

.storage-path-content {
  flex: 1;
  min-width: 0;
}

.storage-path {
  display: block;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.storage-actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.storage-cleanup {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

:root.dark .test-result.success {
  background: #064e3b;
  color: #34d399;
}

:root.dark .test-result.error {
  background: #450a0a;
  color: #f87171;
}

.modal-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
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

/* Transitions */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all var(--transition-base);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Responsive */
@media (max-width: 480px) {
  .modal-overlay {
    padding: 0;
    align-items: flex-end;
  }

  .modal-content {
    max-width: 100%;
    max-height: 95vh;
    max-height: 95dvh;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  }

  .modal-footer {
    flex-wrap: wrap;
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
  }

  .footer-spacer {
    display: none;
  }

  .btn-primary,
  .btn-secondary {
    flex: 1;
  }

  .storage-header {
    flex-direction: column;
  }

  .btn-secondary.compact,
  .storage-cleanup {
    width: 100%;
    justify-content: center;
  }

  .storage-path-row {
    flex-direction: column;
    align-items: stretch;
  }

  .storage-actions {
    width: 100%;
  }
}
</style>
