<template>
  <section id="main-content" class="settings-page" aria-labelledby="settings-title">
    <div class="settings-header">
      <div>
        <p class="settings-eyebrow">{{ t('settings') }}</p>
        <h2 id="settings-title" class="settings-title">{{ t('apiConfig') }}</h2>
      </div>
      <button type="button" class="btn-secondary" @click="router.push({ name: 'chat' })">
        <ArrowLeft :size="16" />
        <span>{{ t('backToChat') }}</span>
      </button>
    </div>

    <div class="settings-layout">
      <aside class="config-list-panel" :aria-label="t('configList')">
        <div class="panel-header">
          <h3>{{ t('configList') }}</h3>
          <button type="button" class="btn-secondary compact" @click="startNewConfig">
            <Plus :size="14" />
            <span>{{ t('addConfig') }}</span>
          </button>
        </div>

        <div v-if="configStore.configs.length === 0" class="empty-config-list">
          <Settings :size="22" />
          <span>{{ t('noConfigs') }}</span>
        </div>
        <div v-else class="config-list">
          <button
            v-for="profile in configStore.configs"
            :key="profile.id"
            type="button"
            :class="[
              'config-list-item',
              {
                selected: profile.id === selectedConfigId && !isCreating,
                active: profile.id === configStore.activeConfigId,
              },
            ]"
            @click="selectConfig(profile.id)"
          >
            <span class="config-name">{{ profile.name }}</span>
            <span class="config-meta"
              >{{ profile.model }} · {{ displayEndpoint(profile.endpoint) }}</span
            >
            <span v-if="profile.id === configStore.activeConfigId" class="active-badge">
              {{ t('activeConfig') }}
            </span>
          </button>
        </div>
      </aside>

      <div class="settings-main">
        <section class="settings-section" aria-labelledby="config-form-title">
          <div class="section-header">
            <div>
              <h3 id="config-form-title">{{ isCreating ? t('addConfig') : t('editConfig') }}</h3>
              <p class="section-description">{{ t('multiConfigHint') }}</p>
            </div>
            <button
              v-if="
                selectedConfigId && selectedConfigId !== configStore.activeConfigId && !isCreating
              "
              type="button"
              class="btn-primary compact"
              @click="handleActivate"
            >
              <Power :size="14" />
              <span>{{ t('setActive') }}</span>
            </button>
          </div>

          <div class="settings-form-grid">
            <div class="form-group">
              <label class="form-label" for="configName">{{ t('configName') }}</label>
              <input
                id="configName"
                v-model="draft.name"
                type="text"
                :placeholder="t('configNamePlaceholder')"
                class="input-field"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="endpoint">{{ t('apiEndpoint') }}</label>
              <input
                id="endpoint"
                v-model="draft.endpoint"
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
                  v-model="draft.apiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  :placeholder="t('apiKeyPlaceholder')"
                  class="input-field"
                />
                <button
                  type="button"
                  class="toggle-visibility"
                  :aria-label="showApiKey ? t('hideApiKey') : t('showApiKey')"
                  @click="showApiKey = !showApiKey"
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
                v-model="draft.model"
                type="text"
                :placeholder="t('modelPlaceholder')"
                class="input-field"
              />
            </div>
          </div>

          <Transition name="slide-up">
            <div
              v-if="testResult"
              :class="['test-result', testResult.success ? 'success' : 'error']"
              role="alert"
            >
              <component :is="testResult.success ? CheckCircle : AlertCircle" :size="18" />
              <span>{{ testResult.message }}</span>
            </div>
          </Transition>

          <div class="form-actions">
            <button
              type="button"
              class="btn-secondary"
              :disabled="!isFormValid || isTesting"
              @click="handleTest"
            >
              <Loader2 v-if="isTesting" :size="16" class="spin" />
              <Zap v-else :size="16" />
              <span>{{ isTesting ? t('testing') : t('testConnection') }}</span>
            </button>
            <button type="button" class="btn-primary" :disabled="!isFormValid" @click="handleSave">
              <Save :size="16" />
              <span>{{ t('saveConfig') }}</span>
            </button>
            <button
              v-if="selectedConfigId && !isCreating"
              type="button"
              class="btn-ghost danger"
              @click="showDeleteConfirm = true"
            >
              <Trash2 :size="16" />
              <span>{{ t('deleteConfig') }}</span>
            </button>
            <button
              v-if="configStore.configs.length > 0"
              type="button"
              class="btn-ghost danger"
              @click="showClearAllConfirm = true"
            >
              <Trash2 :size="16" />
              <span>{{ t('clearAllConfigs') }}</span>
            </button>
          </div>
        </section>

        <section v-if="isDesktop" class="settings-section" aria-labelledby="storage-title">
          <div class="storage-header">
            <div>
              <h3 id="storage-title" class="storage-title">{{ t('localStorage') }}</h3>
              <p class="section-description">{{ t('localStorageHint') }}</p>
            </div>
            <button
              type="button"
              class="btn-secondary compact"
              :disabled="isStorageLoading"
              @click="loadStorageStats"
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

          <div class="storage-path-row">
            <div class="storage-path-content">
              <span class="storage-label">{{ t('dataDirectory') }}</span>
              <strong class="storage-path" :title="dataDirectory">
                {{ dataDirectory || t('loading') }}
              </strong>
            </div>
            <button
              type="button"
              class="btn-secondary compact"
              :disabled="!dataDirectory || isOpeningDataDirectory"
              @click="handleOpenDataDirectory"
            >
              <Loader2 v-if="isOpeningDataDirectory" :size="14" class="spin" />
              <FolderOpen v-else :size="14" />
              <span>{{ t('openDirectory') }}</span>
            </button>
          </div>

          <button
            type="button"
            class="btn-ghost danger storage-cleanup"
            :disabled="storageStats.orphanCount === 0 || isStorageLoading || isCleaningStorage"
            @click="showCleanupConfirm = true"
          >
            <Loader2 v-if="isCleaningStorage" :size="16" class="spin" />
            <span>{{ t('cleanupOrphans') }}</span>
          </button>
        </section>
      </div>
    </div>

    <ConfirmModal
      :is-open="showDeleteConfirm"
      :title="t('deleteConfig')"
      :message="t('deleteConfigConfirm')"
      :confirm-text="t('delete')"
      type="danger"
      @confirm="handleDeleteSelected"
      @cancel="showDeleteConfirm = false"
    />

    <ConfirmModal
      :is-open="showClearAllConfirm"
      :title="t('clearAllConfigs')"
      :message="t('clearAllConfigsConfirm')"
      :confirm-text="t('clear')"
      type="danger"
      @confirm="handleClearAll"
      @cancel="showClearAllConfirm = false"
    />

    <ConfirmModal
      :is-open="showCleanupConfirm"
      :title="t('cleanupOrphans')"
      :message="
        t('cleanupOrphansConfirm', {
          count: storageStats.orphanCount,
          size: formatBytes(storageStats.orphanBytes),
        })
      "
      :confirm-text="t('clear')"
      type="warning"
      @confirm="handleCleanupOrphans"
      @cancel="showCleanupConfirm = false"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeOff,
  FolderOpen,
  Loader2,
  Plus,
  Power,
  Save,
  Settings,
  Trash2,
  Zap,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useConfigStore } from '../../stores/config'
import { useConfig, localizeApiTestResult } from '../../composables/useConfig'
import { useToast } from '../../composables/useToast'
import ConfirmModal from '../Common/ConfirmModal.vue'
import type { ApiConfigProfile } from '../../types'
import { DEFAULT_MODEL } from '../../utils/constants'
import { isTauriRuntime } from '../../platform/runtime'
import {
  cleanupOrphanedLocalImages,
  getLocalDataDirectory,
  getLocalImageStorageStats,
  openLocalDataDirectory,
  type LocalImageStorageStats,
} from '../../platform/imageReferenceCleanup'

const router = useRouter()
const { t } = useI18n()
const { success, warning, error: showError } = useToast()
const configStore = useConfigStore()
const { testApiConnection } = useConfig()

const selectedConfigId = ref<string | null>(null)
const isCreating = ref(false)
const draft = ref<Omit<ApiConfigProfile, 'id'>>({
  name: configStore.nextConfigName(),
  endpoint: '',
  apiKey: '',
  model: DEFAULT_MODEL,
})
const showApiKey = ref(false)
const isTesting = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)
const showDeleteConfirm = ref(false)
const showClearAllConfirm = ref(false)
const showCleanupConfirm = ref(false)
const isDesktop = isTauriRuntime()
const isStorageLoading = ref(false)
const isCleaningStorage = ref(false)
const isOpeningDataDirectory = ref(false)
const dataDirectory = ref('')
const storageStats = ref<LocalImageStorageStats>({
  totalCount: 0,
  totalBytes: 0,
  orphanCount: 0,
  orphanBytes: 0,
})

const isFormValid = computed(
  () =>
    draft.value.endpoint.trim() !== '' &&
    draft.value.apiKey.trim() !== '' &&
    draft.value.model.trim() !== '',
)

function resetTestResult() {
  testResult.value = null
}

function loadDraft(profile: ApiConfigProfile) {
  draft.value = {
    name: profile.name,
    endpoint: profile.endpoint,
    apiKey: profile.apiKey,
    model: profile.model,
  }
  resetTestResult()
}

function startNewConfig() {
  selectedConfigId.value = null
  isCreating.value = true
  draft.value = {
    name: configStore.nextConfigName(),
    endpoint: '',
    apiKey: '',
    model: DEFAULT_MODEL,
  }
  resetTestResult()
}

function selectConfig(id: string) {
  const profile = configStore.configs.find((item) => item.id === id)
  if (!profile) return
  selectedConfigId.value = id
  isCreating.value = false
  loadDraft(profile)
}

function selectDefaultConfig() {
  const preferredId = configStore.activeConfigId || configStore.configs[0]?.id
  if (preferredId) {
    selectConfig(preferredId)
  } else {
    startNewConfig()
  }
}

function displayEndpoint(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return endpoint || t('notConfigured')
  }
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

async function handleSave() {
  if (!isFormValid.value) return
  try {
    if (isCreating.value || !selectedConfigId.value) {
      const profile = await configStore.addConfig(draft.value)
      selectedConfigId.value = profile.id
      isCreating.value = false
    } else {
      await configStore.updateConfig(selectedConfigId.value, draft.value)
    }
    success(t('configSaved'))
  } catch (error) {
    console.error('Save config failed:', error)
    showError(t('unknownError'))
  }
}

async function handleTest() {
  if (!isFormValid.value) return
  isTesting.value = true
  testResult.value = null
  try {
    const result = await testApiConnection({
      endpoint: draft.value.endpoint,
      apiKey: draft.value.apiKey,
      model: draft.value.model,
    })
    testResult.value = { success: result.success, message: localizeApiTestResult(result, t) }
  } catch (error) {
    console.error('API connection test failed:', error)
    testResult.value = { success: false, message: t('unknownError') }
  } finally {
    isTesting.value = false
  }
}

async function handleActivate() {
  if (!selectedConfigId.value) return
  try {
    await configStore.activateConfig(selectedConfigId.value)
    success(t('activeConfigSaved'))
  } catch (error) {
    console.error('Activate config failed:', error)
    showError(t('unknownError'))
  }
}

async function handleDeleteSelected() {
  if (!selectedConfigId.value) return
  showDeleteConfirm.value = false
  try {
    await configStore.deleteConfig(selectedConfigId.value)
    selectDefaultConfig()
  } catch (error) {
    console.error('Delete config failed:', error)
    showError(t('unknownError'))
  }
}

async function handleClearAll() {
  showClearAllConfirm.value = false
  try {
    await configStore.clearAllConfigs()
    startNewConfig()
  } catch (error) {
    console.error('Clear all configs failed:', error)
    showError(t('unknownError'))
  }
}

async function loadStorageStats() {
  if (!isDesktop) return
  isStorageLoading.value = true
  try {
    const [nextStats, nextDataDirectory] = await Promise.all([
      getLocalImageStorageStats(),
      getLocalDataDirectory(),
    ])
    storageStats.value = nextStats
    dataDirectory.value = nextDataDirectory
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
      success(
        t('cleanupComplete', {
          count: result.deletedCount,
          size: formatBytes(result.deletedBytes),
        }),
      )
    }
  } catch (error) {
    console.error('Cleanup orphan image files failed:', error)
    showError(t('cleanupFailed'))
  } finally {
    isCleaningStorage.value = false
  }
}

async function handleOpenDataDirectory() {
  if (!isDesktop || !dataDirectory.value) return
  isOpeningDataDirectory.value = true
  try {
    await openLocalDataDirectory()
  } catch (error) {
    console.error('Open local data directory failed:', error)
    showError(t('openDataDirectoryFailed'))
  } finally {
    isOpeningDataDirectory.value = false
  }
}

watch(
  () => configStore.configs.map((item) => item.id).join(','),
  () => {
    if (isCreating.value) return
    if (
      selectedConfigId.value &&
      configStore.configs.some((item) => item.id === selectedConfigId.value)
    ) {
      return
    }
    selectDefaultConfig()
  },
)

onMounted(() => {
  selectDefaultConfig()
  if (isDesktop) {
    void loadStorageStats()
  }
})
</script>

<style scoped>
.settings-page {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 24px;
  background: var(--color-bg-primary);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 1180px;
  margin: 0 auto 20px;
}

.settings-eyebrow {
  margin-bottom: 4px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.settings-title {
  color: var(--color-text-primary);
  font-size: 24px;
  font-weight: 650;
}

.settings-layout {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  gap: 16px;
  max-width: 1180px;
  margin: 0 auto;
}

.config-list-panel,
.settings-section {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-secondary);
}

.config-list-panel {
  align-self: start;
  padding: 14px;
}

.panel-header,
.section-header,
.storage-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-header {
  align-items: center;
  margin-bottom: 12px;
}

.panel-header h3,
.section-header h3,
.storage-title {
  color: var(--color-text-primary);
  font-size: 15px;
  font-weight: 650;
}

.config-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-list-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  min-height: 72px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  text-align: left;
  cursor: pointer;
  transition: all var(--transition-base);
}

.config-list-item:hover,
.config-list-item.selected {
  border-color: var(--color-border-hover);
  box-shadow: var(--shadow-sm);
}

.config-list-item.active {
  border-color: color-mix(in srgb, var(--color-primary) 44%, var(--color-border));
}

.config-name {
  max-width: 100%;
  overflow: hidden;
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-meta {
  max-width: 100%;
  overflow: hidden;
  color: var(--color-text-tertiary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.active-badge {
  margin-top: 2px;
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 650;
}

.empty-config-list {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 12px;
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.settings-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.settings-section {
  padding: 18px;
}

.section-description,
.form-hint {
  color: var(--color-text-tertiary);
  font-size: 12px;
}

.section-description {
  margin-top: 4px;
}

.settings-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 600;
}

.password-input {
  position: relative;
}

.password-input .input-field {
  padding-right: 44px;
}

.toggle-visibility {
  position: absolute;
  top: 50%;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  transform: translateY(-50%);
  transition: all var(--transition-base);
}

.toggle-visibility:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
}

.btn-primary,
.btn-secondary,
.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.compact {
  min-height: 32px;
  padding: 6px 10px;
  font-size: 12px;
}

.test-result {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 12px 14px;
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

.storage-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.storage-stat,
.storage-path-row {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
}

.storage-stat {
  min-width: 0;
  padding: 10px;
}

.storage-label {
  display: block;
  margin-bottom: 4px;
  color: var(--color-text-tertiary);
  font-size: 11px;
}

.storage-stat strong {
  display: block;
  overflow-wrap: anywhere;
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 650;
}

.storage-path-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  margin-top: 10px;
  padding: 10px;
}

.storage-path-content {
  flex: 1;
  min-width: 0;
}

.storage-path {
  display: block;
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.storage-cleanup {
  margin-top: 12px;
}

:root.dark .test-result.success {
  background: #064e3b;
  color: #34d399;
}

:root.dark .test-result.error {
  background: #450a0a;
  color: #f87171;
}

@media (max-width: 860px) {
  .settings-page {
    padding: 16px;
  }

  .settings-header,
  .settings-layout {
    max-width: 100%;
  }

  .settings-layout {
    grid-template-columns: 1fr;
  }

  .settings-form-grid,
  .storage-grid {
    grid-template-columns: 1fr;
  }
}
</style>
