<script setup lang="ts">
import { ref } from 'vue'
import { Download, Upload, FileJson, Check, AlertCircle, X } from 'lucide-vue-next'
import { useHistory } from '../../composables/useHistory'
import { isTauriRuntime } from '../../platform/runtime'

const { exportHistory, importHistory } = useHistory()

const isDesktopRuntime = isTauriRuntime()
const isOpen = ref(false)
const importMode = ref<'replace' | 'merge'>('merge')
const exportStatus = ref<{ type: 'success' | 'error'; message: string } | null>(null)
const importStatus = ref<{ type: 'success' | 'error'; message: string } | null>(null)
const isExporting = ref(false)
const isImporting = ref(false)
const fileInput = ref<HTMLInputElement>()

function togglePanel() {
  isOpen.value = !isOpen.value
  exportStatus.value = null
  importStatus.value = null
}

async function handleExport() {
  isExporting.value = true
  exportStatus.value = null

  try {
    const result = await exportHistory()
    if (result.canceled) return

    if (!isDesktopRuntime) {
      isOpen.value = false
      return
    }

    exportStatus.value = {
      type: 'success',
      message: '导出完成',
    }
    setTimeout(() => {
      isOpen.value = false
      exportStatus.value = null
    }, 1500)
  } catch (error) {
    console.error('Export error:', error)
    exportStatus.value = {
      type: 'error',
      message: '导出失败，请稍后重试',
    }
  } finally {
    isExporting.value = false
  }
}

function triggerFileInput() {
  fileInput.value?.click()
}

async function handleImport(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  isImporting.value = true
  importStatus.value = null

  try {
    const result = await importHistory(file, importMode.value)
    importStatus.value = {
      type: result.success ? 'success' : 'error',
      message: result.message,
    }

    if (result.success) {
      setTimeout(() => {
        isOpen.value = false
        importStatus.value = null
      }, 1500)
    }
  } catch (error) {
    importStatus.value = {
      type: 'error',
      message: '导入失败',
    }
  } finally {
    isImporting.value = false
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  }
}
</script>

<template>
  <div class="export-import-wrapper">
    <button
      @click="togglePanel"
      class="btn-icon"
      title="导入/导出历史记录"
    >
      <FileJson :size="20" />
    </button>

    <!-- Overlay -->
    <Transition name="fade">
      <div v-if="isOpen" class="overlay" @click="isOpen = false"></div>
    </Transition>

    <!-- Panel -->
    <Transition name="panel">
      <div v-if="isOpen" class="panel">
        <div class="panel-header">
          <h3 class="panel-title">导入/导出</h3>
          <button @click="isOpen = false" class="close-btn">
            <X :size="16" />
          </button>
        </div>

        <div class="panel-content">
          <!-- Export -->
          <div class="section">
            <h4 class="section-title">导出</h4>
            <p class="section-desc">
              将历史记录导出为{{ isDesktopRuntime ? ' ZIP 包' : ' JSON 文件' }}
            </p>
            <button
              @click="handleExport"
              class="btn-primary export-btn"
              :disabled="isExporting"
            >
              <Download :size="16" />
              <span>{{ isExporting ? '导出中...' : '导出历史记录' }}</span>
            </button>

            <Transition name="slide-up">
              <div
                v-if="exportStatus"
                :class="['status-message', exportStatus.type]"
              >
                <Check v-if="exportStatus.type === 'success'" :size="16" />
                <AlertCircle v-else :size="16" />
                <span>{{ exportStatus.message }}</span>
              </div>
            </Transition>
          </div>

          <div class="divider"></div>

          <!-- Import -->
          <div class="section">
            <h4 class="section-title">导入</h4>
            <p class="section-desc">
              从{{ isDesktopRuntime ? ' ZIP 包或 JSON 文件' : ' JSON 文件' }}导入历史记录
            </p>

            <div class="import-mode">
              <label class="mode-option">
                <input
                  type="radio"
                  v-model="importMode"
                  value="merge"
                  name="importMode"
                />
                <span class="mode-label">
                  <strong>合并</strong>
                  <small>添加新消息，保留现有</small>
                </span>
              </label>
              <label class="mode-option">
                <input
                  type="radio"
                  v-model="importMode"
                  value="replace"
                  name="importMode"
                />
                <span class="mode-label">
                  <strong>替换</strong>
                  <small>清除现有，使用导入数据</small>
                </span>
              </label>
            </div>

            <button
              @click="triggerFileInput"
              class="btn-secondary import-btn"
              :disabled="isImporting"
            >
              <Upload :size="16" />
              <span>{{ isImporting ? '导入中...' : '选择文件导入' }}</span>
            </button>

            <input
              ref="fileInput"
              type="file"
              :accept="isDesktopRuntime ? '.zip,.json' : '.json'"
              @change="handleImport"
              class="hidden-input"
            />

            <!-- Status -->
            <Transition name="slide-up">
              <div
                v-if="importStatus"
                :class="['status-message', importStatus.type]"
              >
                <Check v-if="importStatus.type === 'success'" :size="16" />
                <AlertCircle v-else :size="16" />
                <span>{{ importStatus.message }}</span>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.export-import-wrapper {
  position: relative;
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 320px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  z-index: 50;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-base);
}

.close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.panel-content {
  padding: 16px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.section-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.divider {
  height: 1px;
  background: var(--color-border);
  margin: 16px 0;
}

.import-mode {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mode-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
}

.mode-option:hover {
  border-color: var(--color-border-hover);
}

.mode-option input[type="radio"] {
  margin-top: 2px;
  accent-color: var(--color-primary);
}

.mode-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mode-label strong {
  font-size: 13px;
  color: var(--color-text-primary);
}

.mode-label small {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.export-btn,
.import-btn {
  width: 100%;
  justify-content: center;
}

.hidden-input {
  display: none;
}

.status-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: 13px;
  margin-top: 8px;
}

.status-message.success {
  background: #ecfdf5;
  color: #059669;
}

.status-message.error {
  background: #fef2f2;
  color: #dc2626;
}

:root.dark .status-message.success {
  background: #064e3b;
  color: #34d399;
}

:root.dark .status-message.error {
  background: #450a0a;
  color: #f87171;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-base);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.panel-enter-active,
.panel-leave-active {
  transition: all var(--transition-slow);
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all var(--transition-base);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
