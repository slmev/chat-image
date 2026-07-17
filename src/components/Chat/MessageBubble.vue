<template>
  <div :class="messageClasses" class="message-wrapper">
    <!-- User Message -->
    <div v-if="message.type === 'user'" class="user-message">
      <div class="user-content">
        <div class="user-bubble">
          <div v-if="isEditingPrompt" class="prompt-edit-form">
            <textarea
              ref="promptEditTextareaRef"
              v-model="editedPrompt"
              class="prompt-edit-textarea"
              :aria-label="t('editPrompt')"
              rows="3"
              @keydown.esc.prevent="cancelPromptEdit"
              @keydown.meta.enter.prevent="savePromptEdit"
              @keydown.ctrl.enter.prevent="savePromptEdit"
            />
            <div class="prompt-edit-actions">
              <button
                type="button"
                class="prompt-edit-btn"
                :title="t('save')"
                :aria-label="t('save')"
                @click="savePromptEdit"
              >
                <Check :size="14" />
              </button>
              <button
                type="button"
                class="prompt-edit-btn"
                :title="t('cancel')"
                :aria-label="t('cancel')"
                @click="cancelPromptEdit"
              >
                <X :size="14" />
              </button>
            </div>
          </div>
          <p v-else-if="highlightedContent" class="user-text">
            <template v-for="(part, i) in highlightedContent" :key="i"
              ><mark v-if="part.isMatch" class="search-highlight">{{ part.text }}</mark
              ><template v-else>{{ part.text }}</template></template
            >
          </p>
          <p v-else class="user-text">{{ message.content }}</p>
          <div v-if="message.isFavorite" class="favorite-badge">
            <Star :size="12" fill="currentColor" />
          </div>
        </div>
        <div
          v-if="hasAttachments"
          class="user-attachments"
          :class="`attachment-cols-${Math.min(message.attachments?.length || 0, 2)}`"
        >
          <div
            v-for="attachment in message.attachments || []"
            :key="attachment.id"
            class="user-attachment"
          >
            <img :src="attachment.url" :alt="attachment.name" class="user-attachment-image" />
          </div>
        </div>
      </div>
      <MessageActions
        :message-id="message.id"
        :is-favorite="message.isFavorite"
        can-edit-prompt
        class="message-actions"
        @delete="handleDelete"
        @toggle-favorite="handleToggleFavorite"
        @edit-prompt="startPromptEdit"
      />
    </div>

    <!-- Assistant Message -->
    <div v-else class="assistant-message">
      <div
        v-if="message.status === 'pending'"
        class="generation-placeholder"
        :style="{ aspectRatio: placeholderAspectRatio }"
        role="status"
        :aria-label="t('generating')"
      >
        <div class="generation-placeholder-sheen" aria-hidden="true"></div>
        <div class="generation-spinner" aria-hidden="true"></div>
        <div v-if="generationSummary" class="placeholder-summary">
          {{ generationSummary }}
        </div>
        <button
          type="button"
          class="placeholder-cancel-btn"
          :aria-label="t('cancelGeneration')"
          :title="t('cancelGeneration')"
          @click="emit('cancel')"
        >
          <X :size="16" />
        </button>
      </div>

      <div v-else-if="message.status === 'error'" class="assistant-bubble">
        <div class="error-container">
          <p class="error-text">
            <AlertCircle :size="16" />
            <span>{{ message.error || t('generationFailed') }}</span>
          </p>
          <div v-if="generationSummary" class="generation-meta">{{ generationSummary }}</div>
          <div class="retry-actions">
            <button
              class="retry-btn"
              :disabled="isRetrying || !message.generation"
              @click="handleRetry"
            >
              <RefreshCw :size="14" :class="{ spin: isRetrying }" />
              <span>{{ isRetrying ? t('retrying') : t('retry') }}</span>
            </button>
          </div>
        </div>

        <!-- Favorite Badge -->
        <div v-if="message.isFavorite" class="favorite-badge">
          <Star :size="12" fill="currentColor" />
        </div>
      </div>

      <div v-else-if="!hasImages" class="assistant-bubble">
        <p class="assistant-text">{{ message.content }}</p>

        <!-- Favorite Badge -->
        <div v-if="message.isFavorite" class="favorite-badge">
          <Star :size="12" fill="currentColor" />
        </div>
      </div>

      <!-- Image Grid -->
      <div v-if="hasImages && generationSummary" class="generation-meta">
        {{ generationSummary }}
      </div>
      <div
        v-if="hasImages"
        class="image-grid"
        :class="`grid-cols-${Math.min(message.images?.length || 0, 2)}`"
      >
        <div v-if="message.isFavorite" class="favorite-badge image-favorite-badge">
          <Star :size="12" fill="currentColor" />
        </div>
        <div
          v-for="(image, imageIndex) in message.images || []"
          :key="previewKeyFor(imageIndex)"
          class="result-image-item"
        >
          <ImagePreview
            :image="image"
            :preview-images="previewImages"
            :preview-key="previewKeyFor(imageIndex)"
            @create-variation="openVariationDialog"
            @edit-image="openEditDialog"
            @image-load="emit('imageLoad', message.id)"
          />
          <div v-if="message.generation" class="image-quick-actions">
            <button
              type="button"
              class="image-action-btn"
              :title="t('setAsReference')"
              :aria-label="t('setAsReference')"
              @click="emit('setReferenceImage', image)"
            >
              <ImagePlus :size="14" />
            </button>
            <button
              type="button"
              class="image-action-btn"
              :title="t('reuseSameParameters')"
              :aria-label="t('reuseSameParameters')"
              @click="emit('reuseGeneration', message.generation)"
            >
              <Repeat2 :size="14" />
            </button>
            <button
              type="button"
              class="image-action-btn"
              :title="t('copyPrompt')"
              :aria-label="t('copyPrompt')"
              @click="copyGenerationPrompt"
            >
              <Copy :size="14" />
            </button>
            <button
              type="button"
              class="image-action-btn"
              :title="t('viewParameters')"
              :aria-label="t('viewParameters')"
              @click="showParameterDialog = true"
            >
              <Info :size="14" />
            </button>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <MessageActions
        v-if="message.status !== 'pending'"
        :message-id="message.id"
        :is-favorite="message.isFavorite"
        :has-images="!!message.images && message.images.length > 0"
        class="message-actions"
        @delete="handleDelete"
        @toggle-favorite="handleToggleFavorite"
        @create-variation="handleCreateVariation"
        @download-all="handleDownloadAll"
      />

      <!-- Edit Dialogs -->
      <VariationDialog
        v-if="selectedImageForVariation"
        :image="selectedImageForVariation"
        :is-open="showVariationDialog"
        @close="closeVariationDialog"
        @result="handleVariationResult"
      />
      <ImageEditDialog
        v-if="selectedImageForEdit"
        :image="selectedImageForEdit"
        :is-open="showEditDialog"
        @close="closeEditDialog"
        @result="handleEditResult"
      />

      <!-- Delete Confirm -->
      <ConfirmModal
        :is-open="showDeleteConfirm"
        :title="t('deleteMessage')"
        :message="t('deleteMessageConfirm')"
        :confirm-text="t('delete')"
        type="danger"
        @confirm="confirmDelete"
        @cancel="showDeleteConfirm = false"
      />

      <Teleport to="body">
        <Transition name="preview">
          <div
            v-if="showParameterDialog && message.generation"
            class="parameter-overlay"
            role="dialog"
            aria-modal="true"
            :aria-label="t('viewParameters')"
            @click.self="showParameterDialog = false"
          >
            <div ref="parameterPanelRef" class="parameter-panel">
              <div class="parameter-header">
                <h3>{{ t('viewParameters') }}</h3>
                <button
                  type="button"
                  class="parameter-close"
                  :aria-label="t('close')"
                  :title="t('close')"
                  @click="showParameterDialog = false"
                >
                  <X :size="18" />
                </button>
              </div>
              <dl class="parameter-list">
                <div>
                  <dt>{{ t('promptLabel') }}</dt>
                  <dd>{{ message.generation.prompt }}</dd>
                </div>
                <div>
                  <dt>{{ t('size') }}</dt>
                  <dd>{{ generationSizeText }}</dd>
                </div>
                <div>
                  <dt>{{ t('quality') }}</dt>
                  <dd>{{ imageQualityLabel(message.generation.quality) }}</dd>
                </div>
                <div>
                  <dt>{{ t('count') }}</dt>
                  <dd>{{ message.generation.n }}</dd>
                </div>
                <div>
                  <dt>{{ t('style') }}</dt>
                  <dd>{{ message.generation.styleName || t('none') }}</dd>
                </div>
                <div>
                  <dt>{{ t('selectedAttachments') }}</dt>
                  <dd>
                    {{ t('referenceCount', { count: message.generation.attachmentIds.length }) }}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import {
  AlertCircle,
  Check,
  Copy,
  ImagePlus,
  Info,
  RefreshCw,
  Repeat2,
  Star,
  X,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type {
  ChatMessage,
  ConversationPreviewImage,
  GeneratedImage,
  ImageGenerationResponse,
  VariationOptions,
} from '../../types'
import { highlightText } from '../../utils/highlight'
import ImagePreview from './ImagePreview.vue'
import MessageActions from './MessageActions.vue'
import VariationDialog from '../ImageEdit/VariationDialog.vue'
import ImageEditDialog from '../ImageEdit/ImageEditDialog.vue'
import ConfirmModal from '../Common/ConfirmModal.vue'
import { useChat } from '../../composables/useChat'
import { useToast } from '../../composables/useToast'
import { useImageDownload } from '../../composables/useImageDownload'
import { useFocusTrap } from '../../composables/useFocusTrap'
import { useModalLayer } from '../../composables/useModalLayer'
import {
  DEFAULT_GENERATION_OPTIONS,
  findImageSizePreset,
  normalizeImageQuality,
  normalizeImageSize,
  parseImageSize,
} from '../../utils/constants'
import { generationAspectRatio } from '../../utils/generation'
import { isPersistenceError } from '../../utils/storage'

interface Props {
  message: ChatMessage
  previewImages?: ConversationPreviewImage[]
  searchQuery?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  delete: [messageId: string]
  toggleFavorite: [messageId: string]
  cancel: []
  setReferenceImage: [image: GeneratedImage]
  reuseGeneration: [generation: NonNullable<ChatMessage['generation']>]
  imageLoad: [messageId: string]
}>()

const { t } = useI18n()
const { retryGeneration, editUserPrompt, appendDerivedImageResult } = useChat()
const { success, error: showError } = useToast()
const { downloadMultipleImages } = useImageDownload()

// Dialog state
const showVariationDialog = ref(false)
const showEditDialog = ref(false)
const showDeleteConfirm = ref(false)
const selectedImageForVariation = ref<GeneratedImage | null>(null)
const selectedImageForEdit = ref<GeneratedImage | null>(null)
const variationSourceMessageId = ref<string | null>(null)
const editSourceMessageId = ref<string | null>(null)
const pendingDeleteId = ref<string | null>(null)
const isRetrying = ref(false)
const showParameterDialog = ref(false)
const parameterPanelRef = ref<HTMLElement>()
useFocusTrap(parameterPanelRef, { isActive: showParameterDialog })
useModalLayer(showParameterDialog, () => {
  showParameterDialog.value = false
})
const isEditingPrompt = ref(false)
const editedPrompt = ref('')
const promptEditTextareaRef = ref<HTMLTextAreaElement | null>(null)

const messageClasses = computed(() => {
  return props.message.type === 'user' ? 'message-user' : 'message-assistant'
})

const highlightedContent = computed(() => {
  if (!props.searchQuery) return null
  return highlightText(props.message.content, props.searchQuery)
})

const hasImages = computed(() => !!props.message.images && props.message.images.length > 0)
const hasAttachments = computed(
  () => !!props.message.attachments && props.message.attachments.length > 0,
)

function previewKeyFor(imageIndex: number): string {
  return (
    props.previewImages?.find(
      (entry) => entry.messageId === props.message.id && entry.imageIndex === imageIndex,
    )?.key ?? `${props.message.id}:${imageIndex}`
  )
}

const placeholderAspectRatio = computed(() => {
  return generationAspectRatio(props.message.generation)
})

const generationSizeText = computed(() => imageSizeLabel(props.message.generation?.size))

const generationSummary = computed(() => {
  const generation = props.message.generation
  if (!generation) return ''

  return [
    imageQualityLabel(generation.quality),
    imageSizeLabel(generation.size),
    `${generation.n} ${t('imagesUnit')}`,
    generation.styleName || t('none'),
    t('referenceCount', { count: generation.attachmentIds.length }),
  ].join(' · ')
})

function handleDelete(messageId: string) {
  pendingDeleteId.value = messageId
  showDeleteConfirm.value = true
}

function confirmDelete() {
  if (pendingDeleteId.value) {
    emit('delete', pendingDeleteId.value)
    pendingDeleteId.value = null
  }
  showDeleteConfirm.value = false
}

function handleToggleFavorite(messageId: string) {
  emit('toggleFavorite', messageId)
}

async function startPromptEdit() {
  editedPrompt.value = props.message.content
  isEditingPrompt.value = true
  await nextTick()
  promptEditTextareaRef.value?.focus()
  promptEditTextareaRef.value?.select()
}

function cancelPromptEdit() {
  isEditingPrompt.value = false
  editedPrompt.value = ''
}

async function savePromptEdit() {
  const trimmedPrompt = editedPrompt.value.trim()
  if (!trimmedPrompt) {
    showError(t('enterImageDescription'))
    return
  }

  try {
    isEditingPrompt.value = false
    editedPrompt.value = ''
    await editUserPrompt(props.message.id, trimmedPrompt)
  } catch (err) {
    showError(
      isPersistenceError(err)
        ? t('persistenceFailed')
        : err instanceof Error
          ? err.message
          : t('unknownError'),
    )
  }
}

function imageSizeLabel(value: unknown): string {
  const normalizedSize = normalizeImageSize(value)
  if (normalizedSize === DEFAULT_GENERATION_OPTIONS.size) return t('imageSizeAuto')

  const parsed = parseImageSize(normalizedSize)
  if (!parsed) return t('imageSizeAuto')

  const ratio = findImageSizePreset(normalizedSize)?.ratio
  return ratio && ratio !== 'auto'
    ? `${parsed.width}x${parsed.height} · ${ratio}`
    : `${parsed.width}x${parsed.height}`
}

function imageQualityLabel(value: unknown): string {
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

async function handleRetry() {
  if (!props.message.generation) {
    showError(t('originalPromptMissing'))
    return
  }

  isRetrying.value = true

  try {
    await retryGeneration(props.message.id, props.message.generation)
  } catch (err) {
    showError(
      isPersistenceError(err)
        ? t('persistenceFailed')
        : t('retryFailed', {
            message: err instanceof Error ? err.message : t('unknownError'),
          }),
    )
  } finally {
    isRetrying.value = false
  }
}

async function handleDownloadAll() {
  if (props.message.images && props.message.images.length > 0) {
    await downloadMultipleImages(props.message.images)
  }
}

async function copyGenerationPrompt() {
  if (!props.message.generation?.prompt) return

  try {
    await navigator.clipboard.writeText(props.message.generation.prompt)
    success(t('promptCopied'))
  } catch {
    showError(t('copyFailed'))
  }
}

function handleCreateVariation(_messageId?: string) {
  if (props.message.images && props.message.images.length > 0) {
    openVariationDialog(props.message.images[0])
  }
}

function openVariationDialog(image: GeneratedImage, sourceMessageId?: string) {
  selectedImageForVariation.value = image
  variationSourceMessageId.value = sourceMessageId || props.message.id
  showVariationDialog.value = true
}

function closeVariationDialog() {
  showVariationDialog.value = false
  selectedImageForVariation.value = null
  variationSourceMessageId.value = null
}

function openEditDialog(image: GeneratedImage, sourceMessageId?: string) {
  selectedImageForEdit.value = image
  editSourceMessageId.value = sourceMessageId || props.message.id
  showEditDialog.value = true
}

function closeEditDialog() {
  showEditDialog.value = false
  selectedImageForEdit.value = null
  editSourceMessageId.value = null
}

async function handleVariationResult(response: ImageGenerationResponse, options: VariationOptions) {
  try {
    await appendDerivedImageResult(response, {
      content: t('variationGenerated'),
      idPrefix: 'variation',
      prompt: options.prompt,
      generationOptions: options,
      sourceImage: selectedImageForVariation.value,
      sourceMessageId: variationSourceMessageId.value || props.message.id,
    })
  } catch (error) {
    console.error('Variation result failed:', error)
    showError(t(isPersistenceError(error) ? 'persistenceFailed' : 'createVariationFailed'))
  }
}

async function handleEditResult(response: ImageGenerationResponse, prompt: string) {
  try {
    await appendDerivedImageResult(response, {
      content: t('editedImageGenerated'),
      idPrefix: 'edited',
      prompt,
      generationOptions: {
        ...DEFAULT_GENERATION_OPTIONS,
      },
      sourceImage: selectedImageForEdit.value,
      sourceMessageId: editSourceMessageId.value || props.message.id,
    })
  } catch (error) {
    console.error('Edit result failed:', error)
    showError(t(isPersistenceError(error) ? 'persistenceFailed' : 'editImageFailed'))
  }
}
</script>

<style scoped>
.message-wrapper {
  margin-bottom: 24px;
  animation: messageIn 0.3s ease-out;
}

@keyframes messageIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.message-assistant {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

/* User Message */
.user-message {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: min(82%, 760px);
}

.user-content {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  min-width: 0;
}

.user-bubble {
  position: relative;
  padding: 12px 16px;
  background: color-mix(in srgb, var(--color-primary-light) 72%, var(--color-bg-primary));
  border: 1px solid color-mix(in srgb, var(--color-primary) 24%, var(--color-border));
  border-radius: 18px;
}

.user-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-primary);
  white-space: pre-wrap;
}

.prompt-edit-form {
  display: grid;
  gap: 8px;
  min-width: min(520px, 72vw);
}

.prompt-edit-textarea {
  width: 100%;
  min-height: 88px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--color-bg-primary) 78%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 26%, var(--color-border));
  border-radius: 12px;
  color: var(--color-text-primary);
  font-size: 14px;
  line-height: 1.55;
  resize: vertical;
  outline: none;
}

.prompt-edit-textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary-light) 60%, transparent);
}

.prompt-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.prompt-edit-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.prompt-edit-btn:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  color: var(--color-primary);
}

.favorite-badge {
  position: absolute;
  top: -6px;
  left: -6px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fbbf24;
  border-radius: 50%;
  color: white;
  box-shadow: var(--shadow-sm);
}

.user-attachments {
  display: grid;
  gap: 8px;
  max-width: 320px;
}

.attachment-cols-1 {
  grid-template-columns: 1fr;
}

.attachment-cols-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.user-attachment {
  width: 112px;
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border: 1px solid color-mix(in srgb, var(--color-primary) 18%, var(--color-border));
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
}

.user-attachment-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

/* Assistant Message */
.assistant-message {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: min(88%, 920px);
}

.assistant-bubble {
  position: relative;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.assistant-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-primary);
}

.generation-placeholder {
  position: relative;
  width: 100%;
  max-width: 760px;
  min-height: 220px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-border) 62%, transparent);
  border-radius: var(--radius-lg);
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-bg-secondary) 78%, transparent),
      transparent 58%
    ),
    color-mix(in srgb, var(--color-bg-primary) 74%, transparent);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(18px) saturate(1.2);
}

.generation-placeholder::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      120deg,
      rgba(255, 255, 255, 0.28),
      rgba(255, 255, 255, 0.04) 36%,
      transparent 64%
    ),
    repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-border) 18%, transparent) 0,
      color-mix(in srgb, var(--color-border) 18%, transparent) 1px,
      transparent 1px,
      transparent 14px
    );
  opacity: 0.55;
}

.generation-placeholder-sheen {
  position: absolute;
  inset: -40% -60%;
  background: linear-gradient(
    110deg,
    transparent 30%,
    color-mix(in srgb, var(--color-bg-primary) 68%, transparent) 48%,
    transparent 66%
  );
  animation: placeholderSheen 2.4s ease-in-out infinite;
}

.generation-spinner {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 34px;
  height: 34px;
  margin: -17px 0 0 -17px;
  border: 2px solid color-mix(in srgb, var(--color-border) 74%, transparent);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: placeholderSpin 0.9s linear infinite;
}

.placeholder-summary {
  position: absolute;
  left: 14px;
  bottom: 14px;
  max-width: calc(100% - 28px);
  padding: 7px 10px;
  overflow: hidden;
  background: color-mix(in srgb, var(--color-bg-primary) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border) 74%, transparent);
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  backdrop-filter: blur(10px);
}

.placeholder-cancel-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  background: color-mix(in srgb, var(--color-bg-primary) 76%, transparent);
  color: var(--color-text-secondary);
  border: 1px solid color-mix(in srgb, var(--color-border) 74%, transparent);
  border-radius: 999px;
  cursor: pointer;
  backdrop-filter: blur(12px);
  transition: all var(--transition-base);
}

.placeholder-cancel-btn:hover {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
  box-shadow: var(--shadow-sm);
}

@keyframes placeholderSpin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes placeholderSheen {
  0% {
    transform: translateX(-22%);
  }
  55%,
  100% {
    transform: translateX(22%);
  }
}

.error-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.generation-meta {
  max-width: min(760px, 100%);
  padding: 8px 10px;
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error-text {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--color-error);
}

.retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
  align-self: flex-start;
}

.retry-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  color: var(--color-primary);
}

.retry-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.retry-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.spin {
  animation: placeholderSpin 0.9s linear infinite;
}

/* Image Grid */
.image-grid {
  position: relative;
  display: grid;
  gap: 14px;
  width: 100%;
  max-width: 760px;
}

.result-image-item {
  min-width: 0;
}

.image-quick-actions {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.image-action-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.image-action-btn:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.image-favorite-badge {
  z-index: 1;
}

.grid-cols-1 {
  grid-template-columns: 1fr;
}

.grid-cols-2 {
  grid-template-columns: repeat(2, 1fr);
}

.parameter-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(8px);
}

.parameter-panel {
  width: min(92vw, 520px);
  max-height: 82vh;
  overflow: auto;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.parameter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border);
}

.parameter-header h3 {
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 700;
}

.parameter-close {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.parameter-list {
  display: grid;
  gap: 12px;
  padding: 18px;
}

.parameter-list div {
  display: grid;
  gap: 4px;
}

.parameter-list dt {
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-weight: 700;
}

.parameter-list dd {
  color: var(--color-text-primary);
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

/* Message Actions */
.message-actions {
  opacity: 0;
  transition: opacity var(--transition-base);
  padding-left: 2px;
}

.message-wrapper:hover .message-actions {
  opacity: 1;
}

/* Search Highlight */
:deep(.search-highlight) {
  background: #fef08a;
  color: #1a1a1a;
  padding: 1px 2px;
  border-radius: 2px;
}

:root.dark :deep(.search-highlight) {
  background: #854d0e;
  color: #fef3c7;
}

/* Responsive */
@media (max-width: 640px) {
  .user-message,
  .assistant-message {
    max-width: 95%;
  }

  .image-grid {
    max-width: 100%;
  }

  .user-attachment {
    width: 92px;
  }

  .grid-cols-2 {
    grid-template-columns: 1fr;
  }
}
</style>
