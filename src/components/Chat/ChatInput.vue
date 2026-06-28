<template>
  <div class="input-container">
    <!-- Prompt Panel -->
    <Transition name="panel">
      <div v-if="showPromptPanel" class="prompt-panel-wrapper">
        <PromptPanel @select="handlePromptSelect" @close="showPromptPanel = false" />
      </div>
    </Transition>

    <!-- Main Input Area -->
    <div
      class="input-main"
      :class="{ dragging: isDragging }"
      @dragover.prevent="handleDragOver"
      @dragleave="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <input
        ref="fileInputRef"
        type="file"
        class="attachment-input"
        :accept="ATTACHMENT_ACCEPT"
        multiple
        :aria-label="t('attachImages')"
        @change="handleAttachmentSelect"
      />

      <div
        v-if="selectedAttachments.length > 0"
        class="attachment-rail"
        :aria-label="t('selectedAttachments')"
      >
        <div
          v-for="attachment in selectedAttachments"
          :key="attachment.id"
          class="attachment-thumb"
        >
          <img :src="attachment.url" :alt="attachment.file.name" class="attachment-preview" />
          <span class="attachment-name" :title="attachment.file.name">
            {{ attachment.file.name }}
          </span>
          <button
            type="button"
            class="attachment-remove"
            :aria-label="t('removeAttachment')"
            :title="t('removeAttachment')"
            :disabled="disabled"
            @click="removeAttachment(attachment.id)"
          >
            <X :size="12" />
          </button>
        </div>
      </div>

      <div class="input-row">
        <!-- Prompt Button -->
        <button
          :class="['prompt-btn', { active: showPromptPanel }]"
          :aria-label="t('promptTemplates')"
          :aria-expanded="showPromptPanel"
          :title="t('promptTemplates')"
          :disabled="disabled"
          @click="showPromptPanel = !showPromptPanel"
        >
          <Sparkles :size="20" />
        </button>

        <!-- Attachment Button -->
        <button
          type="button"
          class="attachment-btn"
          :aria-label="t('attachImages')"
          :title="t('attachImages')"
          :disabled="disabled || selectedAttachments.length >= MAX_ATTACHMENT_COUNT"
          @click="openAttachmentPicker"
        >
          <Paperclip :size="20" />
        </button>

        <!-- Textarea -->
        <div class="textarea-wrapper">
          <PromptSuggest
            :visible="showSuggestions"
            :enhancers="suggestions.enhancers"
            :template-matches="suggestions.templateMatches"
            @add="handleAddKeyword"
            @use-template="handleUseTemplate"
          />
          <textarea
            ref="textareaRef"
            v-model="inputContent"
            :placeholder="t('inputPlaceholder')"
            :aria-label="t('imageDescription')"
            rows="1"
            :disabled="disabled"
            class="chat-textarea"
            @keydown="handleKeydown"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
            @focus="showSuggestions = true"
          />
        </div>

        <!-- Send Button -->
        <button
          :disabled="disabled || !inputContent.trim()"
          class="send-btn"
          :aria-label="t('send')"
          @click="handleSend"
        >
          <Send :size="20" />
        </button>
      </div>

      <!-- Options Bar -->
      <div class="options-bar" role="group" :aria-label="t('generationOptions')">
        <!-- Size -->
        <div class="option-group">
          <label class="option-label">{{ t('size') }}</label>
          <button
            type="button"
            :class="['size-summary-btn', { active: showSizePanel }]"
            :disabled="disabled"
            :aria-expanded="showSizePanel"
            aria-controls="generation-size-panel"
            @click="showSizePanel = !showSizePanel"
          >
            <Ruler :size="13" />
            <span>{{ sizeSummary }}</span>
            <ChevronDown :size="13" :class="{ open: showSizePanel }" />
          </button>
        </div>

        <!-- Quality -->
        <div class="option-group">
          <label class="option-label">{{ t('quality') }}</label>
          <div class="quality-segmented" role="radiogroup" :aria-label="t('quality')">
            <button
              v-for="quality in IMAGE_QUALITIES"
              :key="quality.value"
              :class="['quality-segment', { active: selectedOptions.quality === quality.value }]"
              :disabled="disabled"
              role="radio"
              :aria-checked="selectedOptions.quality === quality.value"
              @click="selectedOptions.quality = quality.value"
            >
              {{ imageQualityLabel(quality.value) }}
            </button>
          </div>
        </div>

        <!-- Count -->
        <div class="option-group">
          <label class="option-label">{{ t('count') }}</label>
          <div class="count-selector">
            <button
              :disabled="disabled || selectedOptions.n <= IMAGE_COUNT_RANGE.min"
              class="count-btn"
              :aria-label="t('decrease')"
              @click="decrementCount"
            >
              <Minus :size="14" />
            </button>
            <span class="count-value" aria-live="polite">{{ selectedOptions.n }}</span>
            <button
              :disabled="disabled || selectedOptions.n >= IMAGE_COUNT_RANGE.max"
              class="count-btn"
              :aria-label="t('increase')"
              @click="incrementCount"
            >
              <Plus :size="14" />
            </button>
          </div>
        </div>

        <!-- Style -->
        <div class="option-group">
          <label class="option-label">{{ t('style') }}</label>
          <div class="style-chips" role="radiogroup" :aria-label="t('style')">
            <button
              :class="['style-chip', { active: !selectedStyleId }]"
              :disabled="disabled"
              role="radio"
              :aria-checked="!selectedStyleId"
              @click="selectedStyleId = ''"
            >
              {{ t('none') }}
            </button>
            <button
              v-for="style in allStyles"
              :key="style.id"
              :class="['style-chip', { active: selectedStyleId === style.id }]"
              :disabled="disabled"
              role="radio"
              :aria-checked="selectedStyleId === style.id"
              @click="selectedStyleId = style.id"
            >
              {{ styleLabel(style) }}
            </button>
            <button
              class="style-chip add-style"
              :disabled="disabled"
              :title="t('createStyle')"
              @click="openCreateStyle"
            >
              <Plus :size="12" />
            </button>
          </div>
        </div>
      </div>

      <Transition name="size-panel">
        <div
          v-if="showSizePanel"
          id="generation-size-panel"
          class="size-panel"
          :aria-label="t('size')"
        >
          <div class="dimension-row">
            <label class="dimension-field">
              <span class="dimension-label">W</span>
              <input
                v-model="widthInput"
                class="dimension-input"
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                :disabled="disabled || isAutoSize"
                :aria-label="t('width')"
                @input="handleDimensionInput"
              />
            </label>
            <button
              type="button"
              class="swap-size-btn"
              :disabled="disabled || isAutoSize || !widthInput || !heightInput"
              :aria-label="t('swapDimensions')"
              :title="t('swapDimensions')"
              @click="swapDimensions"
            >
              <ArrowLeftRight :size="14" />
            </button>
            <label class="dimension-field">
              <span class="dimension-label">H</span>
              <input
                v-model="heightInput"
                class="dimension-input"
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                :disabled="disabled || isAutoSize"
                :aria-label="t('height')"
                @input="handleDimensionInput"
              />
            </label>
          </div>
          <div class="ratio-grid" role="radiogroup" :aria-label="t('aspectRatio')">
            <button
              v-for="preset in IMAGE_SIZE_PRESETS"
              :key="preset.value"
              type="button"
              :class="['ratio-card', { active: selectedSizePreset === preset.value }]"
              :disabled="disabled"
              role="radio"
              :aria-checked="selectedSizePreset === preset.value"
              @click="applySizePreset(preset)"
            >
              <span
                class="ratio-icon"
                :class="{ auto: preset.value === 'auto' }"
                :style="ratioIconStyle(preset)"
                aria-hidden="true"
              >
                <span v-if="preset.value === 'auto'">A</span>
              </span>
              <span class="ratio-label">{{ imageSizeLabel(preset) }}</span>
              <span v-if="preset.width && preset.height" class="ratio-size">
                {{ preset.width }}x{{ preset.height }}
              </span>
            </button>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Custom Style Dialog -->
    <CustomStyleDialog
      :is-open="showStyleDialog"
      :editing-style="editingStyle"
      @close="showStyleDialog = false"
      @save="handleSaveStyle"
      @delete="handleDeleteStyle"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  ArrowLeftRight,
  ChevronDown,
  Ruler,
  Sparkles,
  Send,
  Minus,
  Plus,
  Paperclip,
  X,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import {
  DEFAULT_GENERATION_OPTIONS,
  IMAGE_COUNT_RANGE,
  IMAGE_QUALITIES,
  IMAGE_SIZE_PRESETS,
  STYLE_TEMPLATES,
  STORAGE_KEYS,
  findImageSizePreset,
  normalizeGenerationOptions,
  normalizeImageQuality,
  normalizeImageSize,
  parseImageSize,
  type ImageSizePreset,
} from '../../utils/constants'
import { getGenerationOptions, setGenerationOptions } from '../../utils/storage'
import { getMetadataValue, setMetadataValue } from '../../platform/metadataStore'
import { isTauriRuntime } from '../../platform/runtime'
import { getEnhancementSuggestions } from '../../utils/promptEnhancers'
import { PROMPT_TEMPLATES } from '../../utils/promptTemplates'
import { useCustomStyles } from '../../composables/useCustomStyles'
import { useToast } from '../../composables/useToast'
import PromptPanel from '../Prompt/PromptPanel.vue'
import PromptSuggest from '../Prompt/PromptSuggest.vue'
import CustomStyleDialog from '../Style/CustomStyleDialog.vue'
import type { GenerationOptions, StyleTemplate } from '../../types'

const { t } = useI18n()
const { customStyles, addStyle, deleteStyle } = useCustomStyles()

interface Props {
  disabled?: boolean
}

interface Emits {
  (e: 'send', content: string, options: GenerationOptions, attachments: File[]): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const { error: showError } = useToast()

const textareaRef = ref<HTMLTextAreaElement>()
const fileInputRef = ref<HTMLInputElement>()
const inputContent = ref('')
const selectedOptions = ref<Omit<GenerationOptions, 'style'>>({
  ...DEFAULT_GENERATION_OPTIONS,
})
const selectedSizePreset = ref<string>(DEFAULT_GENERATION_OPTIONS.size)
const widthInput = ref('')
const heightInput = ref('')
const selectedStyleId = ref<string>('')
const showSizePanel = ref(false)
const showPromptPanel = ref(false)
const showStyleDialog = ref(false)
const editingStyle = ref<StyleTemplate | null>(null)
const isDragging = ref(false)

const ATTACHMENT_ACCEPT = 'image/png,image/jpeg,image/webp'
const MAX_ATTACHMENT_COUNT = 4
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
const ACCEPTED_ATTACHMENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

interface SelectedAttachment {
  id: string
  file: File
  url: string
}

const selectedAttachments = ref<SelectedAttachment[]>([])

// 合并内置和自定义风格
const allStyles = computed(() => [...STYLE_TEMPLATES, ...customStyles.value])
const isAutoSize = computed(() => selectedSizePreset.value === DEFAULT_GENERATION_OPTIONS.size)
const sizeSummary = computed(() => {
  const normalizedSize = normalizeImageSize(selectedOptions.value.size)
  if (normalizedSize === DEFAULT_GENERATION_OPTIONS.size) return t('imageSizeAuto')

  const parsed = parseImageSize(normalizedSize)
  if (!parsed) return t('imageSizeAuto')

  const ratio = findImageSizePreset(normalizedSize)?.ratio
  return ratio && ratio !== 'auto'
    ? `${parsed.width}x${parsed.height} · ${ratio}`
    : `${parsed.width}x${parsed.height}`
})

function imageSizeLabel(preset: ImageSizePreset): string {
  return t(preset.labelKey)
}

function imageQualityLabel(value: string): string {
  switch (normalizeImageQuality(value)) {
    case 'high':
      return t('qualityHigh')
    case 'medium':
      return t('qualityMedium')
    case 'low':
      return t('qualityLow')
    case 'auto':
    default:
      return t('qualityAuto')
  }
}

function ratioIconStyle(preset: ImageSizePreset) {
  if (!preset.width || !preset.height) return {}
  return { aspectRatio: `${preset.width} / ${preset.height}` }
}

function toDimension(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function setSizeValue(size: string): void {
  const normalizedSize = normalizeImageSize(size)
  selectedOptions.value.size = normalizedSize

  const preset = findImageSizePreset(normalizedSize)
  selectedSizePreset.value = preset?.value ?? 'custom'

  const parsed = parseImageSize(normalizedSize)
  widthInput.value = parsed ? String(parsed.width) : ''
  heightInput.value = parsed ? String(parsed.height) : ''
}

function applySizePreset(preset: ImageSizePreset): void {
  setSizeValue(preset.value)
}

function handleDimensionInput(): void {
  const width = toDimension(widthInput.value)
  const height = toDimension(heightInput.value)

  selectedSizePreset.value = 'custom'
  selectedOptions.value.size =
    width && height ? `${width}x${height}` : DEFAULT_GENERATION_OPTIONS.size
}

function swapDimensions(): void {
  if (isAutoSize.value || !widthInput.value || !heightInput.value) return

  const nextWidth = heightInput.value
  heightInput.value = widthInput.value
  widthInput.value = nextWidth
  handleDimensionInput()
}

function styleLabel(style: StyleTemplate): string {
  switch (style.id) {
    case 'anime':
      return t('styleAnime')
    case 'realistic':
      return t('styleRealistic')
    case 'oil-painting':
      return t('styleOilPainting')
    case 'watercolor':
      return t('styleWatercolor')
    case 'sketch':
      return t('styleSketch')
    case 'cyberpunk':
      return t('styleCyberpunk')
    default:
      return style.name
  }
}

// IME state
const isComposing = ref(false)
const suppressNextEnterAfterComposition = ref(false)
let compositionEndTimer: number | null = null

// Prompt suggestions
const showSuggestions = ref(false)
const suggestions = computed(() => {
  if (!inputContent.value.trim() || inputContent.value.trim().length < 2) {
    return { enhancers: [], templateMatches: [] }
  }
  return getEnhancementSuggestions(inputContent.value, PROMPT_TEMPLATES)
})

function handleAddKeyword(keyword: string) {
  const trimmed = inputContent.value.trim()
  inputContent.value = trimmed ? `${trimmed}, ${keyword}` : keyword
}

function handleUseTemplate(prompt: string) {
  inputContent.value = prompt
  showSuggestions.value = false
}

function openCreateStyle() {
  editingStyle.value = null
  showStyleDialog.value = true
}

function handleSaveStyle(style: Omit<StyleTemplate, 'id'>) {
  addStyle(style)
}

function handleDeleteStyle() {
  if (editingStyle.value) {
    deleteStyle(editingStyle.value.id)
    if (selectedStyleId.value === editingStyle.value.id) {
      selectedStyleId.value = ''
    }
  }
}

const selectedStyle = computed<StyleTemplate | undefined>(() => {
  if (!selectedStyleId.value) return undefined
  return allStyles.value.find((style) => style.id === selectedStyleId.value)
})

function saveGenerationOptions(options: GenerationOptions): void {
  const normalizedOptions = normalizeGenerationOptions(options)
  if (isTauriRuntime()) {
    void setMetadataValue(STORAGE_KEYS.GENERATION_OPTIONS, normalizedOptions).catch((error) => {
      console.error('Save generation options failed:', error)
    })
  } else {
    setGenerationOptions(normalizedOptions)
  }
}

// 读取上次的生成参数
onMounted(async () => {
  const savedOptions = isTauriRuntime()
    ? await getMetadataValue<GenerationOptions>(
        STORAGE_KEYS.GENERATION_OPTIONS,
        getGenerationOptions(),
      )
    : getGenerationOptions()
  const normalizedOptions = normalizeGenerationOptions(savedOptions)
  selectedOptions.value = {
    size: normalizedOptions.size,
    quality: normalizedOptions.quality,
    n: normalizedOptions.n,
  }
  setSizeValue(normalizedOptions.size)
  // 恢复上次选择的风格（若该风格仍存在）
  if (
    normalizedOptions.style &&
    allStyles.value.some((style) => style.id === normalizedOptions.style!.id)
  ) {
    selectedStyleId.value = normalizedOptions.style.id
  }
})

// 保存生成参数
watch(
  selectedOptions,
  (newOptions) => {
    const options = {
      ...newOptions,
      style: selectedStyle.value,
    }
    saveGenerationOptions(options)
  },
  { deep: true },
)

watch(selectedStyleId, () => {
  const options = {
    ...selectedOptions.value,
    style: selectedStyle.value,
  }
  saveGenerationOptions(options)
})

// Auto-resize textarea (使用 requestAnimationFrame 防抖)
let rafId: number | null = null

function resizeTextarea() {
  if (rafId) {
    cancelAnimationFrame(rafId)
  }
  rafId = requestAnimationFrame(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
      textareaRef.value.style.height = Math.min(textareaRef.value.scrollHeight, 120) + 'px'
    }
    rafId = null
  })
}

watch(inputContent, resizeTextarea)

function handleCompositionStart() {
  clearCompositionEndTimer()
  isComposing.value = true
  suppressNextEnterAfterComposition.value = false
}

function handleCompositionEnd() {
  isComposing.value = false
  suppressNextEnterAfterComposition.value = true
  compositionEndTimer = window.setTimeout(() => {
    suppressNextEnterAfterComposition.value = false
    compositionEndTimer = null
  }, 100)
}

function clearCompositionEndTimer() {
  if (compositionEndTimer !== null) {
    window.clearTimeout(compositionEndTimer)
    compositionEndTimer = null
  }
}

function isImeComposing(event: KeyboardEvent): boolean {
  return isComposing.value || event.isComposing || event.keyCode === 229
}

function handleKeydown(event: KeyboardEvent) {
  if (isImeComposing(event)) return

  if (event.key === 'Enter' && !event.shiftKey) {
    if (suppressNextEnterAfterComposition.value) {
      event.preventDefault()
      suppressNextEnterAfterComposition.value = false
      clearCompositionEndTimer()
      return
    }

    event.preventDefault()
    handleSend()
  }
}

function handlePromptSelect(prompt: string) {
  inputContent.value = prompt
  showPromptPanel.value = false
}

function openAttachmentPicker() {
  if (props.disabled || selectedAttachments.value.length >= MAX_ATTACHMENT_COUNT) return
  fileInputRef.value?.click()
}

function createAttachmentId(file: File): string {
  return `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`
}

function addAttachmentFiles(files: File[]): void {
  if (props.disabled) return

  for (const file of files) {
    if (selectedAttachments.value.length >= MAX_ATTACHMENT_COUNT) {
      showError(t('attachmentLimit', { count: MAX_ATTACHMENT_COUNT }))
      break
    }

    if (!ACCEPTED_ATTACHMENT_TYPES.has(file.type)) {
      showError(t('attachmentInvalidType', { name: file.name }))
      continue
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      showError(t('attachmentTooLarge', { name: file.name }))
      continue
    }

    selectedAttachments.value.push({
      id: createAttachmentId(file),
      file,
      url: URL.createObjectURL(file),
    })
  }
}

defineExpose({
  addAttachmentFiles,
})

function handleAttachmentSelect(event: Event) {
  const input = event.target as HTMLInputElement
  addAttachmentFiles(Array.from(input.files || []))
  input.value = ''
}

function removeAttachment(id: string) {
  const index = selectedAttachments.value.findIndex((attachment) => attachment.id === id)
  if (index === -1) return

  URL.revokeObjectURL(selectedAttachments.value[index].url)
  selectedAttachments.value.splice(index, 1)
}

function clearAttachments() {
  selectedAttachments.value.forEach((attachment) => {
    URL.revokeObjectURL(attachment.url)
  })
  selectedAttachments.value = []
}

function handleDragOver(event: DragEvent) {
  if (props.disabled) return
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
  isDragging.value = true
}

function handleDragLeave(event: DragEvent) {
  const currentTarget = event.currentTarget as Node
  const relatedTarget = event.relatedTarget as Node | null
  if (relatedTarget && currentTarget.contains(relatedTarget)) return
  isDragging.value = false
}

function handleDrop(event: DragEvent) {
  isDragging.value = false
  if (props.disabled) return
  addAttachmentFiles(Array.from(event.dataTransfer?.files || []))
}

function incrementCount() {
  if (selectedOptions.value.n < IMAGE_COUNT_RANGE.max) {
    selectedOptions.value.n++
  }
}

function decrementCount() {
  if (selectedOptions.value.n > IMAGE_COUNT_RANGE.min) {
    selectedOptions.value.n--
  }
}

function handleSend() {
  if (!inputContent.value.trim() || props.disabled) return

  const fullOptions: GenerationOptions = {
    ...normalizeGenerationOptions(selectedOptions.value),
    style: selectedStyle.value,
  }
  const files = selectedAttachments.value.map((attachment) => attachment.file)

  emit('send', inputContent.value.trim(), fullOptions, files)
  inputContent.value = ''
  clearAttachments()
  showSuggestions.value = false
  showSizePanel.value = false

  // Reset textarea height
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
    }
  })
}

onBeforeUnmount(() => {
  clearCompositionEndTimer()
  clearAttachments()
})
</script>

<style scoped>
.input-container {
  position: relative;
  padding: 0 20px 20px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    color-mix(in srgb, var(--color-bg-primary) 96%, var(--color-bg-secondary)) 14%
  );
}

.prompt-panel-wrapper {
  position: absolute;
  bottom: 100%;
  left: 20px;
  right: 20px;
  margin-bottom: 8px;
}

.input-main {
  padding: 14px;
  background: color-mix(in srgb, var(--color-bg-primary) 92%, var(--color-bg-secondary));
  border: 1px solid var(--color-border);
  border-radius: 24px;
  box-shadow: var(--shadow-lg);
  transition:
    border-color var(--transition-base),
    background var(--transition-base);
}

.input-main.dragging {
  background: color-mix(in srgb, var(--color-primary-light) 18%, var(--color-bg-primary));
  border-color: color-mix(in srgb, var(--color-primary) 54%, var(--color-border));
}

.attachment-input {
  display: none;
}

.attachment-rail {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.attachment-thumb {
  position: relative;
  width: 72px;
  height: 72px;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
}

.attachment-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.attachment-name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 6px 5px;
  overflow: hidden;
  color: white;
  font-size: 10px;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.68));
}

.attachment-remove {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-bg-primary) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
  border-radius: 999px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.attachment-remove:hover:not(:disabled) {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
}

.input-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

/* Input Action Buttons */
.prompt-btn,
.attachment-btn {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.prompt-btn:hover:not(:disabled),
.attachment-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  color: var(--color-primary);
}

.prompt-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.prompt-btn:disabled,
.attachment-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Textarea */
.textarea-wrapper {
  flex: 1;
  min-width: 0;
}

.chat-textarea {
  width: 100%;
  min-height: 44px;
  max-height: 120px;
  padding: 10px 14px;
  background: transparent;
  border: none;
  border-radius: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-primary);
  resize: none;
  outline: none;
  transition: all var(--transition-base);
}

.chat-textarea::placeholder {
  color: var(--color-text-tertiary);
}

.chat-textarea:focus {
  box-shadow: none;
}

.chat-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Send Button */
.send-btn {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-primary);
  border: none;
  border-radius: 14px;
  color: white;
  cursor: pointer;
  transition: all var(--transition-base);
  box-shadow: var(--shadow-sm);
}

.send-btn:hover:not(:disabled) {
  box-shadow: var(--shadow-md);
  background: var(--color-primary-hover);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Options Bar */
.options-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.option-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.option-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-tertiary);
  white-space: nowrap;
  min-width: 28px;
}

.option-chips,
.style-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.size-summary-btn {
  height: 28px;
  max-width: 190px;
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-base);
}

.size-summary-btn span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size-summary-btn:hover:not(:disabled),
.size-summary-btn.active {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.size-summary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.size-summary-btn .open {
  transform: rotate(180deg);
}

.size-panel {
  margin-top: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 72%, var(--color-bg-primary));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.dimension-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dimension-field {
  width: 118px;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.dimension-label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-tertiary);
}

.dimension-input {
  min-width: 0;
  width: 100%;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  outline: none;
}

.dimension-input:disabled {
  color: var(--color-text-tertiary);
  cursor: not-allowed;
}

.swap-size-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.swap-size-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.swap-size-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ratio-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 6px;
}

.ratio-card {
  min-height: 72px;
  padding: 8px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 8px;
  row-gap: 2px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-base);
}

.ratio-card:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  color: var(--color-text-primary);
}

.ratio-card.active {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.ratio-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ratio-icon {
  grid-row: 1 / span 2;
  width: 28px;
  max-height: 28px;
  align-self: center;
  justify-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, currentColor 12%, transparent);
  border: 1px solid currentColor;
  border-radius: 4px;
}

.ratio-icon.auto {
  aspect-ratio: 1;
  border-style: dashed;
  font-size: 11px;
  font-weight: 700;
}

.ratio-label {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ratio-size {
  min-width: 0;
  overflow: hidden;
  font-size: 10px;
  line-height: 1.2;
  color: var(--color-text-tertiary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quality-segmented {
  display: inline-flex;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
}

.quality-segment {
  min-width: 44px;
  height: 28px;
  padding: 0 10px;
  background: transparent;
  border: 0;
  border-right: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}

.quality-segment:last-child {
  border-right: 0;
}

.quality-segment:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.quality-segment.active {
  background: var(--color-primary);
  color: white;
}

.quality-segment:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.option-chip,
.style-chip {
  padding: 5px 10px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}

.option-chip:hover:not(:disabled),
.style-chip:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  color: var(--color-text-primary);
}

.option-chip.active,
.style-chip.active {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.option-chip:disabled,
.style-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.style-chip.add-style {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-style: dashed;
}

/* Count Selector */
.count-selector {
  display: flex;
  align-items: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.count-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.count-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.count-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.count-value {
  width: 28px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* Panel Transition */
.panel-enter-active,
.panel-leave-active {
  transition: all var(--transition-slow);
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.size-panel-enter-active,
.size-panel-leave-active {
  transition: all var(--transition-base);
}

.size-panel-enter-from,
.size-panel-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Responsive */
@media (max-width: 640px) {
  .input-container {
    padding: 0 12px 12px;
  }

  .prompt-panel-wrapper {
    left: 12px;
    right: 12px;
  }

  .options-bar {
    gap: 8px;
  }

  .ratio-grid {
    grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  }

  .option-chip,
  .style-chip,
  .quality-segment {
    padding: 4px 8px;
    font-size: 11px;
  }
}

@media (max-width: 480px) {
  .options-bar {
    gap: 6px;
  }

  .dimension-field {
    width: calc((100% - 38px) / 2);
  }

  .ratio-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
