<template>
  <div class="chat-container">
    <!-- Search Bar -->
    <SearchBar
      v-model:search-query="searchQuery"
      v-model:show-favorites-only="showFavoritesOnly"
      @clear="clearSearch"
    />

    <!-- Messages Area -->
    <div
      id="main-content"
      ref="messagesContainer"
      class="messages-area"
      role="log"
      :aria-label="t('messageArea')"
      aria-live="polite"
    >
      <!-- Empty State -->
      <div v-if="chatStore.messages.length === 0" class="empty-state">
        <div class="empty-eyebrow">
          <ImageIcon :size="16" />
          <span>{{ t('imageConversation') }}</span>
        </div>
        <h2 class="empty-title">{{ t('startCreating') }}</h2>
        <p class="empty-description">{{ t('startDescription') }}</p>

        <!-- Quick Start Templates -->
        <div class="quick-start-grid">
          <button
            v-for="(template, index) in quickStartTemplates"
            :key="template.id"
            class="quick-start-card"
            :style="{ '--card-index': index }"
            :disabled="chatStore.isLoading || !isConfigured"
            @click="handleQuickStart(template.prompt)"
          >
            <div class="quick-start-icon">
              <component :is="getTemplateIcon(template.category)" :size="20" />
            </div>
            <span class="quick-start-text">{{ promptTemplateTitle(template) }}</span>
          </button>
        </div>
      </div>

      <!-- No Results -->
      <div v-else-if="filteredMessages.length === 0" class="empty-state">
        <Search :size="48" class="empty-icon" />
        <h2 class="empty-title">{{ t('noResults') }}</h2>
        <p class="empty-description">{{ t('noResultsHint') }}</p>
      </div>

      <!-- Messages List -->
      <template v-else>
        <MessageBubble
          v-for="message in filteredMessages"
          :key="message.id"
          :message="message"
          :search-query="searchQuery"
          @delete="handleDelete"
          @toggle-favorite="handleToggleFavorite"
          @cancel="handleCancel"
          @set-reference-image="handleSetReferenceImage"
          @reuse-generation="handleReuseGeneration"
          @image-load="handleImageLoad"
        />
      </template>
    </div>

    <!-- Input Area -->
    <ChatInput
      ref="chatInputRef"
      :disabled="chatStore.isLoading || !isConfigured"
      @send="handleSend"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import type { Component } from 'vue'
import { ImageIcon, Layers, Mountain, Search, Sparkles, Users, Cat } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useChat } from '../../composables/useChat'
import { useHistory } from '../../composables/useHistory'
import { usePromptSuggestions } from '../../composables/usePromptSuggestions'
import { useConfigStore } from '../../stores/config'
import { useKeyboardShortcuts } from '../../composables/useKeyboardShortcuts'
import { useToast } from '../../composables/useToast'
import { isTauriRuntime } from '../../platform/runtime'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'
import SearchBar from './SearchBar.vue'
import type {
  ChatInputAttachment,
  GeneratedImage,
  GenerationMetadata,
  GenerationOptions,
  PromptTemplate,
} from '../../types'
import { DEFAULT_GENERATION_OPTIONS } from '../../utils/constants'
import { isPersistenceError } from '../../utils/storage'

const { t } = useI18n()
const { chatStore, sendMessage, cancelCurrentGeneration, startNewChat } = useChat()
const {
  searchQuery,
  showFavoritesOnly,
  filteredMessages,
  deleteMessage,
  toggleFavorite,
  clearSearch,
} = useHistory()
const { templates } = usePromptSuggestions()
const configStore = useConfigStore()
const { error: showError } = useToast()

// 快捷键：仅在 Tauri 桌面端注册 Ctrl/Cmd+N，
// Web 端该组合被浏览器保留为「新建窗口」，preventDefault 不可靠（L3）。
useKeyboardShortcuts(
  isTauriRuntime()
    ? [
        {
          key: 'n',
          ctrl: true,
          handler: () => {
            if (chatStore.messages.length > 0) {
              startNewChat()
            }
          },
          description: 'New chat',
        },
      ]
    : [],
)

const messagesContainer = ref<HTMLElement>()
const chatInputRef = ref<{
  addAttachmentFiles: (files: File[]) => void
  addReferenceImage: (image: GeneratedImage) => void
  fillDraftFromGeneration: (generation: GenerationMetadata) => void
  restoreDraft: (
    content: string,
    options: GenerationOptions,
    attachments: ChatInputAttachment[],
  ) => void
} | null>(null)

const isConfigured = computed(() => configStore.isConfigured)

// Quick start templates
const quickStartTemplates = computed(() => {
  const categories = ['people', 'landscape', 'animals', 'abstract'] as const
  return categories
    .map((cat) => templates.value.find((t) => t.category === cat))
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .slice(0, 4)
})

function getTemplateIcon(category: string) {
  const icons: Record<string, Component> = {
    people: Users,
    landscape: Mountain,
    animals: Cat,
    abstract: Layers,
  }
  return icons[category] || Sparkles
}

function promptTemplateTitle(template: PromptTemplate): string {
  const [category, index] = template.id.split('-')
  if (!category || !index) return template.title
  const key = `promptTemplate${category[0].toUpperCase()}${category.slice(1)}${index}`
  return t(key)
}

async function handleSend(
  content: string,
  options: GenerationOptions,
  attachments: ChatInputAttachment[] = [],
) {
  try {
    await sendMessage(content, options, attachments)
  } catch (error) {
    console.error('Send message failed:', error)
    chatInputRef.value?.restoreDraft(content, options, attachments)
    showError(t(isPersistenceError(error) ? 'persistenceFailed' : 'sendMessageFailed'))
  }
}

async function handleCancel() {
  try {
    await cancelCurrentGeneration()
  } catch (error) {
    console.error('Cancel generation failed:', error)
    showError(t('cancelGenerationFailed'))
  }
}

async function handleDelete(messageId: string) {
  try {
    await deleteMessage(messageId)
  } catch (error) {
    console.error('Delete message failed:', error)
    showError(t('deleteMessageFailed'))
  }
}

async function handleToggleFavorite(messageId: string) {
  try {
    await toggleFavorite(messageId)
  } catch (error) {
    console.error('Toggle favorite failed:', error)
    showError(t('favoriteFailed'))
  }
}

function handleQuickStart(prompt: string) {
  if (chatStore.isLoading || !isConfigured.value) return
  handleSend(prompt, {
    ...DEFAULT_GENERATION_OPTIONS,
  })
}

function handleSetReferenceImage(image: GeneratedImage) {
  chatInputRef.value?.addReferenceImage(image)
}

function handleReuseGeneration(generation: GenerationMetadata) {
  chatInputRef.value?.fillDraftFromGeneration(generation)
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

async function scrollToBottomAfterRender() {
  await nextTick()
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      resolve()
      return
    }
    requestAnimationFrame(() => resolve())
  })
  scrollToBottom()
}

function handleImageLoad(messageId: string) {
  const lastMessage = chatStore.messages.at(-1)
  if (lastMessage?.id !== messageId) return
  void scrollToBottomAfterRender()
}

watch(
  () => {
    const lastMessage = chatStore.messages.at(-1)
    return {
      messageCount: chatStore.messages.length,
      lastMessageId: lastMessage?.id,
      lastMessageStatus: lastMessage?.status,
      lastMessageImageCount: lastMessage?.images?.length ?? 0,
      lastMessageError: lastMessage?.error,
    }
  },
  async (current, previous) => {
    const hasNewMessage = current.messageCount > previous.messageCount
    const hasLastMessageUpdate =
      current.messageCount === previous.messageCount &&
      current.lastMessageId === previous.lastMessageId &&
      (current.lastMessageStatus !== previous.lastMessageStatus ||
        current.lastMessageImageCount !== previous.lastMessageImageCount ||
        current.lastMessageError !== previous.lastMessageError)

    if (!hasNewMessage && !hasLastMessageUpdate) return
    await scrollToBottomAfterRender()
  },
)

function clipboardFiles(event: ClipboardEvent): File[] {
  const data = event.clipboardData
  if (!data) return []

  const files = Array.from(data.files || [])
  if (files.length > 0) return files

  return Array.from(data.items || [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
}

function hasPlainText(event: ClipboardEvent): boolean {
  return Array.from(event.clipboardData?.types || []).includes('text/plain')
}

function isInsideDialog(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[role="dialog"]'))
}

function handlePaste(event: ClipboardEvent) {
  if (isInsideDialog(event.target)) return

  const files = clipboardFiles(event)
  if (files.length === 0) return

  chatInputRef.value?.addAttachmentFiles(files)
  if (!hasPlainText(event)) {
    event.preventDefault()
  }
}

onMounted(() => {
  document.addEventListener('paste', handlePaste)
  if (messagesContainer.value && chatStore.messages.length > 0) {
    scrollToBottom()
  }
})

onUnmounted(() => {
  document.removeEventListener('paste', handlePaste)
})
</script>

<style scoped>
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px 24px 12px;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 56px 20px 72px;
  text-align: center;
}

.empty-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  margin-bottom: 22px;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--shadow-sm);
}

.empty-eyebrow svg {
  color: var(--color-primary);
}

.empty-title {
  font-size: 34px;
  font-weight: 680;
  line-height: 1.1;
  letter-spacing: -0.02em;
  background: linear-gradient(
    120deg,
    var(--color-text-primary) 0%,
    color-mix(in srgb, var(--color-primary) 70%, var(--color-text-primary)) 60%,
    var(--color-accent-2) 120%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: var(--color-text-primary);
  margin-bottom: 12px;
  max-width: 680px;
}

.empty-description {
  font-size: 15px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  margin-bottom: 28px;
  max-width: 540px;
}

.empty-icon {
  color: var(--color-text-tertiary);
  margin-bottom: 20px;
}

/* Quick Start Grid */
.quick-start-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 240px));
  gap: 10px;
  max-width: 520px;
  width: 100%;
}

.quick-start-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 16px;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-base);
  text-align: left;
  box-shadow: var(--shadow-sm);
  opacity: 0;
  /* Animate opacity + `translate` (not `transform`) so the entrance never
     fights the :hover lift, which uses `transform`. */
  animation: card-in var(--transition-slow) cubic-bezier(0.32, 0.72, 0, 1) forwards;
}

.quick-start-card:nth-child(1) {
  animation-delay: 40ms;
}
.quick-start-card:nth-child(2) {
  animation-delay: 100ms;
}
.quick-start-card:nth-child(3) {
  animation-delay: 160ms;
}
.quick-start-card:nth-child(4) {
  animation-delay: 220ms;
}

@keyframes card-in {
  from {
    opacity: 0;
    translate: 0 12px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

.quick-start-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--color-primary) 40%, var(--glass-border));
  box-shadow: var(--shadow-lg);
}

.quick-start-card:disabled {
  cursor: not-allowed;
  opacity: 0.58;
  transform: none;
  box-shadow: var(--shadow-sm);
}

.quick-start-card:hover .quick-start-icon {
  background: var(--gradient-primary);
  border-color: transparent;
  color: var(--color-text-inverse);
  box-shadow: var(--shadow-primary);
}

.quick-start-card:disabled .quick-start-icon {
  background: color-mix(in srgb, var(--color-bg-primary) 82%, var(--color-bg-secondary));
  border-color: var(--color-border);
  color: var(--color-text-tertiary);
  box-shadow: none;
}

.quick-start-icon {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  color: var(--color-primary);
  transition: all var(--transition-base);
}

.quick-start-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  line-height: 1.4;
}

/* Responsive */
@media (max-width: 640px) {
  .messages-area {
    padding: 18px 16px 10px;
  }

  .quick-start-grid {
    grid-template-columns: 1fr;
  }

  .quick-start-card {
    padding: 18px 16px;
    min-height: 64px;
  }

  .empty-title {
    font-size: 24px;
  }
}
</style>
