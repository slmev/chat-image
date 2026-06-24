<template>
  <div :class="messageClasses" class="message-wrapper">
    <!-- User Message -->
    <div v-if="message.type === 'user'" class="user-message">
      <div class="user-bubble">
        <p v-if="highlightedContent" class="user-text"><template v-for="(part, i) in highlightedContent" :key="i">{{ part }}</template></p>
        <p v-else class="user-text">{{ message.content }}</p>
        <div v-if="message.isFavorite" class="favorite-badge">
          <Star :size="12" fill="currentColor" />
        </div>
      </div>
      <MessageActions
        :message-id="message.id"
        :is-favorite="message.isFavorite"
        class="message-actions"
        @delete="handleDelete"
        @toggle-favorite="handleToggleFavorite"
      />
    </div>

    <!-- Assistant Message -->
    <div v-else class="assistant-message">
      <div class="assistant-bubble">
        <!-- Status Content -->
        <p v-if="message.status === 'pending'" class="assistant-text">
          {{ message.content }}
        </p>
        <div v-else-if="message.status === 'error'" class="error-container">
          <p class="error-text">
            <AlertCircle :size="16" />
            <span>{{ message.error || '生成失败' }}</span>
          </p>
          <button
            @click="handleRetry"
            class="retry-btn"
            :disabled="isRetrying"
          >
            <RefreshCw :size="14" :class="{ 'spin': isRetrying }" />
            <span>{{ isRetrying ? '重试中...' : '重试' }}</span>
          </button>
        </div>
        <p v-else class="assistant-text">图片已生成</p>

        <!-- Favorite Badge -->
        <div v-if="message.isFavorite" class="favorite-badge">
          <Star :size="12" fill="currentColor" />
        </div>
      </div>

      <!-- Image Grid -->
      <div
        v-if="message.images && message.images.length > 0"
        class="image-grid"
        :class="`grid-cols-${Math.min(message.images.length, 2)}`"
      >
        <ImagePreview
          v-for="image in message.images"
          :key="image.id"
          :image="image"
          @create-variation="openVariationDialog"
          @edit-image="openEditDialog"
        />
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
        title="删除消息"
        message="确定要删除这条消息吗？此操作不可恢复。"
        confirm-text="删除"
        type="danger"
        @confirm="confirmDelete"
        @cancel="showDeleteConfirm = false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Star, AlertCircle, RefreshCw } from 'lucide-vue-next'
import type { ChatMessage, GeneratedImage, ImageGenerationResponse } from '../../types'
import { highlightText } from '../../utils/highlight'
import ImagePreview from './ImagePreview.vue'
import MessageActions from './MessageActions.vue'
import VariationDialog from '../ImageEdit/VariationDialog.vue'
import ImageEditDialog from '../ImageEdit/ImageEditDialog.vue'
import ConfirmModal from '../Common/ConfirmModal.vue'
import { useChatStore } from '../../stores/chat'
import { useChat } from '../../composables/useChat'
import { useToast } from '../../composables/useToast'
import { useImageDownload } from '../../composables/useImageDownload'
import { persistGeneratedImagesFromResponse } from '../../utils/images'

interface Props {
  message: ChatMessage
  searchQuery?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  delete: [messageId: string]
  toggleFavorite: [messageId: string]
  retry: [messageId: string]
}>()

const chatStore = useChatStore()
const { sendMessage } = useChat()
const { error: showError } = useToast()
const { downloadMultipleImages } = useImageDownload()

// Dialog state
const showVariationDialog = ref(false)
const showEditDialog = ref(false)
const showDeleteConfirm = ref(false)
const selectedImageForVariation = ref<GeneratedImage | null>(null)
const selectedImageForEdit = ref<GeneratedImage | null>(null)
const pendingDeleteId = ref<string | null>(null)
const isRetrying = ref(false)

const messageClasses = computed(() => {
  return props.message.type === 'user' ? 'message-user' : 'message-assistant'
})

const highlightedContent = computed(() => {
  if (!props.searchQuery) return null
  return highlightText(props.message.content, props.searchQuery)
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

async function handleRetry() {
  isRetrying.value = true

  try {
    // 找到前面的用户消息
    const messages = chatStore.messages
    const currentIndex = messages.findIndex(m => m.id === props.message.id)
    let userPrompt = ''

    // 向前查找最近的用户消息
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (messages[i].type === 'user') {
        userPrompt = messages[i].content
        break
      }
    }

    if (!userPrompt) {
      showError('无法找到原始提示词')
      return
    }

    // 删除当前错误消息
    emit('delete', props.message.id)

    // 重新发送
    await sendMessage(userPrompt, {
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    })
  } catch (err) {
    showError('重试失败：' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    isRetrying.value = false
  }
}

async function handleDownloadAll() {
  if (props.message.images && props.message.images.length > 0) {
    await downloadMultipleImages(props.message.images)
  }
}

function handleCreateVariation(_messageId?: string) {
  if (props.message.images && props.message.images.length > 0) {
    openVariationDialog(props.message.images[0])
  }
}

function openVariationDialog(image: GeneratedImage) {
  selectedImageForVariation.value = image
  showVariationDialog.value = true
}

function closeVariationDialog() {
  showVariationDialog.value = false
  selectedImageForVariation.value = null
}

function openEditDialog(image: GeneratedImage) {
  selectedImageForEdit.value = image
  showEditDialog.value = true
}

function closeEditDialog() {
  showEditDialog.value = false
  selectedImageForEdit.value = null
}

async function buildImagesFromResponse(
  response: ImageGenerationResponse,
  prefix: string,
  sourcePrompt: string,
): Promise<GeneratedImage[]> {
  return persistGeneratedImagesFromResponse(response, {
    idPrefix: prefix,
    sourcePrompt,
    sourceMessageId: props.message.id,
  })
}

async function handleVariationResult(response: ImageGenerationResponse) {
  const newImages = await buildImagesFromResponse(
    response,
    'variation',
    selectedImageForVariation.value?.sourcePrompt || props.message.content,
  )

  chatStore.addMessage({
    type: 'assistant',
    content: '变体图片已生成',
    status: 'success',
    images: newImages,
  })
  await chatStore.flushHistorySave()
}

async function handleEditResult(response: ImageGenerationResponse) {
  const newImages = await buildImagesFromResponse(
    response,
    'edited',
    selectedImageForEdit.value?.sourcePrompt || props.message.content,
  )

  chatStore.addMessage({
    type: 'assistant',
    content: '编辑后的图片已生成',
    status: 'success',
    images: newImages,
  })
  await chatStore.flushHistorySave()
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

.error-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
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

/* Image Grid */
.image-grid {
  display: grid;
  gap: 14px;
  width: 100%;
  max-width: 760px;
}

.grid-cols-1 {
  grid-template-columns: 1fr;
}

.grid-cols-2 {
  grid-template-columns: repeat(2, 1fr);
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

  .grid-cols-2 {
    grid-template-columns: 1fr;
  }
}
</style>
