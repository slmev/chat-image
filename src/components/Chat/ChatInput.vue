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
    <div class="input-main">
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
              {{ size.label }}
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
              {{ quality.label }}
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
              {{ style.name }}
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
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import { Sparkles, Send, Minus, Plus } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { IMAGE_SIZES, IMAGE_QUALITIES, STYLE_TEMPLATES, STORAGE_KEYS } from '../../utils/constants'
import { getGenerationOptions, setGenerationOptions } from '../../utils/storage'
import { getMetadataValue, setMetadataValue } from '../../platform/metadataStore'
import { isTauriRuntime } from '../../platform/runtime'
import { getEnhancementSuggestions } from '../../utils/promptEnhancers'
import { PROMPT_TEMPLATES } from '../../utils/promptTemplates'
import { useCustomStyles } from '../../composables/useCustomStyles'
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
  (e: 'send', content: string, options: GenerationOptions): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const textareaRef = ref<HTMLTextAreaElement>()
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

// 合并内置和自定义风格
const allStyles = computed(() => [...STYLE_TEMPLATES, ...customStyles.value])

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

  emit('send', inputContent.value.trim(), fullOptions)
  inputContent.value = ''
  showSuggestions.value = false

  // Reset textarea height
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
    }
  })
}
</script>

<style scoped>
.input-container {
  position: relative;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-primary);
}

.prompt-panel-wrapper {
  position: absolute;
  bottom: 100%;
  left: 16px;
  right: 16px;
  margin-bottom: 8px;
}

.input-main {
  padding: 12px 16px;
}

.input-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

/* Prompt Button */
.prompt-btn {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.prompt-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  color: var(--color-primary);
}

.prompt-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.prompt-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Textarea */
.textarea-wrapper {
  flex: 1;
}

.chat-textarea {
  width: 100%;
  min-height: 44px;
  max-height: 120px;
  padding: 10px 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
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
  background: var(--color-bg-primary);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
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
  border-radius: var(--radius-md);
  color: white;
  cursor: pointer;
  transition: all var(--transition-base);
  box-shadow: var(--shadow-sm);
}

.send-btn:hover:not(:disabled) {
  opacity: 0.9;
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.send-btn:active:not(:disabled) {
  transform: translateY(0);
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
  margin-top: 10px;
  padding-top: 10px;
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
  background: var(--color-bg-tertiary);
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
  background: var(--color-bg-tertiary);
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
  .input-main {
    padding: 10px 12px;
  }

  .options-bar {
    gap: 6px;
  }
}
</style>
