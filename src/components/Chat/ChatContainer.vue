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
            v-for="template in quickStartTemplates"
            :key="template.id"
            class="quick-start-card"
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
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import type { Component } from 'vue'
import { ImageIcon, Layers, Mountain, Search, Sparkles, Users, Cat } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useChat } from '../../composables/useChat'
import { useHistory } from '../../composables/useHistory'
import { usePromptSuggestions } from '../../composables/usePromptSuggestions'
import { useConfigStore } from '../../stores/config'
import { useKeyboardShortcuts } from '../../composables/useKeyboardShortcuts'
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

// 快捷键
useKeyboardShortcuts([
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
])

const messagesContainer = ref<HTMLElement>()
const chatInputRef = ref<{
  addAttachmentFiles: (files: File[]) => void
  addReferenceImage: (image: GeneratedImage) => void
  fillDraftFromGeneration: (generation: GenerationMetadata) => void
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
    await nextTick()
    scrollToBottom()
  } catch (error) {
    console.error('Send message failed:', error)
  }
}

async function handleCancel() {
  try {
    await cancelCurrentGeneration()
  } catch (error) {
    console.error('Cancel generation failed:', error)
  }
}

async function handleDelete(messageId: string) {
  try {
    await deleteMessage(messageId)
  } catch (error) {
    console.error('Delete message failed:', error)
  }
}

async function handleToggleFavorite(messageId: string) {
  try {
    await toggleFavorite(messageId)
  } catch (error) {
    console.error('Toggle favorite failed:', error)
  }
}

function handleQuickStart(prompt: string) {
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
  background: var(--color-bg-primary);
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
  padding: 8px 12px;
  margin-bottom: 20px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.empty-title {
  font-size: 32px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 12px;
  max-width: 680px;
}

.empty-description {
  font-size: 15px;
  color: var(--color-text-secondary);
  margin-bottom: 28px;
  max-width: 540px;
  line-height: 1.6;
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
  padding: 14px 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  cursor: pointer;
  transition: all var(--transition-base);
  text-align: left;
}

.quick-start-card:hover {
  background: var(--color-bg-primary);
  border-color: var(--color-border-hover);
  box-shadow: var(--shadow-md);
}

.quick-start-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  color: var(--color-primary);
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

  .empty-title {
    font-size: 24px;
  }
}
</style>
