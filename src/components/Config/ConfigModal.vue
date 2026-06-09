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

        <div v-if="isDesktop" class="storage-section">
          <div class="storage-header">
            <div>
              <h3 class="storage-title">{{ t('localStorage') }}</h3>
              <p class="form-hint">{{ t('localStorageHint') }}</p>
            </div>
            <button
              @click="loadStorageStats"
              class="btn-secondary compact"
              :disabled="isStorageLoading"
              type="button"
            >
              <Loader2 v-if="isStorageLoading" :size="14" class="spin" />
              <span>{{ t('refresh') }}</span>
            </button>
          </div>

          <div class="storage-grid">
            <div class="storage-stat">
              <span class="storage-label">{{ t('imageCount') }}</span>
              <strong>{{ storageStats.totalCount }}</strong>
            </div>
            <div class="storage-stat">
              <span class="storage-label">{{ t('storageUsed') }}</span>
              <strong>{{ formatBytes(storageStats.totalBytes) }}</strong>
            </div>
            <div class="storage-stat">
              <span class="storage-label">{{ t('orphanImages') }}</span>
              <strong>{{ storageStats.orphanCount }}</strong>
            </div>
            <div class="storage-stat">
              <span class="storage-label">{{ t('reclaimableSpace') }}</span>
              <strong>{{ formatBytes(storageStats.orphanBytes) }}</strong>
            </div>
          </div>

          <button
            @click="showCleanupConfirm = true"
            class="btn-ghost danger storage-cleanup"
            :disabled="storageStats.orphanCount === 0 || isStorageLoading || isCleaningStorage"
            type="button"
          >
            <Loader2 v-if="isCleaningStorage" :size="16" class="spin" />
            <span>{{ t('cleanupOrphans') }}</span>
          </button>
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
        <button
          v-if="configStore.isConfigured"
          @click="handleClear"
          class="btn-ghost danger"
        >
          {{ t('clearConfig') }}
        </button>
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

    <ConfirmModal
      :is-open="showCleanupConfirm"
      :title="t('cleanupOrphans')"
      :message="t('cleanupOrphansConfirm', {
        count: storageStats.orphanCount,
        size: formatBytes(storageStats.orphanBytes),
      })"
      :confirm-text="t('clear')"
      type="warning"
      @confirm="handleCleanupOrphans"
      @cancel="showCleanupConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Settings, X, Eye, EyeOff, Save, Zap, Loader2, CheckCircle, AlertCircle } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useConfig } from '../../composables/useConfig'
import { useToast } from '../../composables/useToast'
import ConfirmModal from '../Common/ConfirmModal.vue'
import type { ApiConfig } from '../../types'
import { DEFAULT_MODEL } from '../../utils/constants'
import { isTauriRuntime } from '../../platform/runtime'
import {
  cleanupOrphanedLocalImages,
  getLocalImageStorageStats,
  type LocalImageStorageStats,
} from '../../platform/imageReferenceCleanup'

const { t } = useI18n()
const { success, warning, error: showError } = useToast()

const emit = defineEmits<{
  close: []
}>()

const { configStore, testApiConnection, initializeConfig } = useConfig()

const localConfig = ref<ApiConfig>(initializeConfig())
const isTesting = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)
const showApiKey = ref(false)
const isDesktop = isTauriRuntime()
const isStorageLoading = ref(false)
const isCleaningStorage = ref(false)
const showCleanupConfirm = ref(false)
const storageStats = ref<LocalImageStorageStats>({
  totalCount: 0,
  totalBytes: 0,
  orphanCount: 0,
  orphanBytes: 0,
})

function handleKeydown(event: KeyboardEvent) {
  if (showCleanupConfirm.value) {
    return
  }
  if (event.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  if (isDesktop) {
    void loadStorageStats()
  }
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

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

async function loadStorageStats() {
  if (!isDesktop) return
  isStorageLoading.value = true
  try {
    storageStats.value = await getLocalImageStorageStats()
  } catch (error) {
    console.error('Load local image storage stats failed:', error)
    showError(t('storageStatsFailed'))
  } finally {
    isStorageLoading.value = false
  }
}

async function handleCleanupOrphans() {
  if (!isDesktop) return
  showCleanupConfirm.value = false
  isCleaningStorage.value = true
  try {
    const result = await cleanupOrphanedLocalImages()
    storageStats.value = {
      totalCount: result.totalCount,
      totalBytes: result.totalBytes,
      orphanCount: result.orphanCount,
      orphanBytes: result.orphanBytes,
    }

    if (result.failedCount > 0) {
      warning(t('cleanupPartial', { count: result.failedCount }))
    } else {
      success(t('cleanupComplete', {
        count: result.deletedCount,
        size: formatBytes(result.deletedBytes),
      }))
    }
  } catch (error) {
    console.error('Cleanup orphan image files failed:', error)
    showError(t('cleanupFailed'))
  } finally {
    isCleaningStorage.value = false
  }
}

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
    await configStore.saveConfig(localConfig.value)
  } catch (error) {
    console.error('Save config failed:', error)
    testResult.value = { success: false, message: t('unknownError') }
    isTesting.value = false
    return
  }

  const result = await testApiConnection()
  testResult.value = result

  isTesting.value = false
}

async function handleClear() {
  try {
    await configStore.clearConfig()
  } catch (error) {
    console.error('Clear config failed:', error)
    testResult.value = { success: false, message: t('unknownError') }
    return
  }
  localConfig.value = {
    endpoint: '',
    apiKey: '',
    model: DEFAULT_MODEL,
  }
  testResult.value = null
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
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
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
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    overflow-y: auto;
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
}
</style>
