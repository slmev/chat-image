<template>
  <div class="input-container">
    <!-- Prompt Panel -->
    <Transition name="panel">
      <div v-if="showPromptPanel" class="prompt-panel-wrapper">
        <PromptPanel
          @select="handlePromptSelect"
          @close="showPromptPanel = false"
        />
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
          <img
            :src="attachment.url"
            :alt="attachment.file.name"
            class="attachment-preview"
          />
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
          @click="showPromptPanel = !showPromptPanel"
          :class="['prompt-btn', { active: showPromptPanel }]"
          :aria-label="t('promptTemplates')"
          :aria-expanded="showPromptPanel"
          :title="t('promptTemplates')"
          :disabled="disabled"
        >
          <Sparkles :size="20" />
        </button>

        <!-- Attachment Button -->
        <button
          type="button"
          @click="openAttachmentPicker"
          class="attachment-btn"
          :aria-label="t('attachImages')"
          :title="t('attachImages')"
          :disabled="disabled || selectedAttachments.length >= MAX_ATTACHMENT_COUNT"
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
            v-model="inputContent"
            @keydown="handleKeydown"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
            @focus="showSuggestions = true"
            :placeholder="t('inputPlaceholder')"
            :aria-label="t('imageDescription')"
            rows="1"
            :disabled="disabled"
            class="chat-textarea"
            ref="textareaRef"
          />
        </div>

        <!-- Send Button -->
        <button
          @click="handleSend"
          :disabled="disabled || !inputContent.trim()"
          class="send-btn"
          :aria-label="t('send')"
        >
          <Send :size="20" />
        </button>
      </div>

      <!-- Options Bar -->
      <div class="options-bar" role="group" :aria-label="t('generationOptions')">
        <!-- Size -->
        <div class="option-group">
          <label class="option-label">{{ t('size') }}</label>
          <div class="option-chips" role="radiogroup" :aria-label="t('size')">
            <button
              v-for="size in IMAGE_SIZES"
              :key="size.value"
              @click="selectedOptions.size = size.value"
              :class="['option-chip', { active: selectedOptions.size === size.value }]"
              :disabled="disabled"
              role="radio"
              :aria-checked="selectedOptions.size === size.value"
            >
              {{ imageSizeLabel(size.value) }}
            </button>
          </div>
        </div>

        <!-- Quality -->
        <div class="option-group">
          <label class="option-label">{{ t('quality') }}</label>
          <div class="option-chips" role="radiogroup" :aria-label="t('quality')">
            <button
              v-for="quality in IMAGE_QUALITIES"
              :key="quality.value"
              @click="selectedOptions.quality = quality.value"
              :class="['option-chip', { active: selectedOptions.quality === quality.value }]"
              :disabled="disabled"
              role="radio"
              :aria-checked="selectedOptions.quality === quality.value"
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
              @click="decrementCount"
              :disabled="disabled || selectedOptions.n <= 1"
              class="count-btn"
              :aria-label="t('decrease')"
            >
              <Minus :size="14" />
            </button>
            <span class="count-value" aria-live="polite">{{ selectedOptions.n }}</span>
            <button
              @click="incrementCount"
              :disabled="disabled || selectedOptions.n >= 4"
              class="count-btn"
              :aria-label="t('increase')"
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
              @click="selectedStyleId = ''"
              :class="['style-chip', { active: !selectedStyleId }]"
              :disabled="disabled"
              role="radio"
              :aria-checked="!selectedStyleId"
            >
              {{ t('none') }}
            </button>
            <button
              v-for="style in allStyles"
              :key="style.id"
              @click="selectedStyleId = style.id"
              :class="['style-chip', { active: selectedStyleId === style.id }]"
              :disabled="disabled"
              role="radio"
              :aria-checked="selectedStyleId === style.id"
            >
              {{ styleLabel(style) }}
            </button>
            <button
              @click="openCreateStyle"
              class="style-chip add-style"
              :disabled="disabled"
              :title="t('createStyle')"
            >
              <Plus :size="12" />
            </button>
          </div>
        </div>
      </div>
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
import { Sparkles, Send, Minus, Plus, Paperclip, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { IMAGE_SIZES, IMAGE_QUALITIES, STYLE_TEMPLATES, STORAGE_KEYS } from '../../utils/constants'
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
  size: '1024x1024',
  quality: 'standard',
  n: 1,
})
const selectedStyleId = ref<string>('')
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

function imageSizeLabel(value: string): string {
  switch (value) {
    case '1024x1024':
      return t('imageSizeSquare')
    case '1792x1024':
      return t('imageSizeLandscape')
    case '1024x1792':
      return t('imageSizePortrait')
    default:
      return value
  }
}

function imageQualityLabel(value: string): string {
  return value === 'hd' ? t('qualityHd') : t('qualityStandard')
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
  return allStyles.value.find(style => style.id === selectedStyleId.value)
})

function saveGenerationOptions(options: GenerationOptions): void {
  if (isTauriRuntime()) {
    void setMetadataValue(STORAGE_KEYS.GENERATION_OPTIONS, options).catch(error => {
      console.error('Save generation options failed:', error)
    })
  } else {
    setGenerationOptions(options)
  }
}

// 读取上次的生成参数
onMounted(async () => {
  const savedOptions = isTauriRuntime()
    ? await getMetadataValue<GenerationOptions>(STORAGE_KEYS.GENERATION_OPTIONS, getGenerationOptions())
    : getGenerationOptions()
  selectedOptions.value = {
    size: savedOptions.size,
    quality: savedOptions.quality,
    n: savedOptions.n,
  }
})

// 保存生成参数
watch(selectedOptions, (newOptions) => {
  const options = {
    ...newOptions,
    style: selectedStyle.value,
  }
  saveGenerationOptions(options)
}, { deep: true })

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
  isComposing.value = true
}

function handleCompositionEnd() {
  isComposing.value = false
}

function handleKeydown(event: KeyboardEvent) {
  if (isComposing.value) return

  if (event.key === 'Enter' && !event.shiftKey) {
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

function handleAttachmentSelect(event: Event) {
  const input = event.target as HTMLInputElement
  addAttachmentFiles(Array.from(input.files || []))
  input.value = ''
}

function removeAttachment(id: string) {
  const index = selectedAttachments.value.findIndex(attachment => attachment.id === id)
  if (index === -1) return

  URL.revokeObjectURL(selectedAttachments.value[index].url)
  selectedAttachments.value.splice(index, 1)
}

function clearAttachments() {
  selectedAttachments.value.forEach(attachment => {
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
  if (props.disabled) return
  isDragging.value = false
  addAttachmentFiles(Array.from(event.dataTransfer?.files || []))
}

function incrementCount() {
  if (selectedOptions.value.n < 4) {
    selectedOptions.value.n++
  }
}

function decrementCount() {
  if (selectedOptions.value.n > 1) {
    selectedOptions.value.n--
  }
}

function handleSend() {
  if (!inputContent.value.trim() || props.disabled) return

  const fullOptions: GenerationOptions = {
    ...selectedOptions.value,
    style: selectedStyle.value,
  }
  const files = selectedAttachments.value.map(attachment => attachment.file)

  emit('send', inputContent.value.trim(), fullOptions, files)
  inputContent.value = ''
  clearAttachments()
  showSuggestions.value = false

  // Reset textarea height
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
    }
  })
}

onBeforeUnmount(() => {
  clearAttachments()
})
</script>

<style scoped>
.input-container {
  position: relative;
  padding: 0 20px 20px;
  background: linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--color-bg-primary) 96%, var(--color-bg-secondary)) 14%);
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
  transition: border-color var(--transition-base), background var(--transition-base);
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

  .option-chip,
  .style-chip {
    padding: 4px 8px;
    font-size: 11px;
  }
}

@media (max-width: 480px) {
  .options-bar {
    gap: 6px;
  }
}
</style>
