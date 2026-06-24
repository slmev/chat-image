<template>
  <div class="chat-container">
    <!-- Search Bar -->
    <SearchBar
      v-model:searchQuery="searchQuery"
      v-model:showFavoritesOnly="showFavoritesOnly"
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
          <span>Image conversation</span>
        </div>
        <h2 class="empty-title">{{ t('startCreating') }}</h2>
        <p class="empty-description">{{ t('startDescription') }}</p>

        <!-- Quick Start Templates -->
        <div class="quick-start-grid">
          <button
            v-for="template in quickStartTemplates"
            :key="template.id"
            @click="handleQuickStart(template.prompt)"
            class="quick-start-card"
          >
            <div class="quick-start-icon">
              <component :is="getTemplateIcon(template.category)" :size="20" />
            </div>
            <span class="quick-start-text">{{ template.title }}</span>
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
        />
      </template>

      <!-- Loading State -->
      <Transition name="slide-up">
        <div
          v-if="chatStore.isLoading"
          class="loading-indicator"
          role="status"
          :aria-label="t('generating')"
        >
          <div class="loading-pill">
            <div class="loading-content">
              <div class="loading-spinner">
                <div class="spinner-ring"></div>
              </div>
              <div class="loading-text-container">
                <span class="loading-text">{{ loadingText }}</span>
                <span class="loading-dots">{{ loadingDots }}</span>
              </div>
            </div>
            <button
              @click="handleCancel"
              class="cancel-pill"
              type="button"
            >
              {{ t('cancel') }}
            </button>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Input Area -->
    <ChatInput
      @send="handleSend"
      :disabled="chatStore.isLoading || !isConfigured"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, computed, watch, onUnmounted } from 'vue'
import { ImageIcon, Search, Users, Mountain, Cat, Layers, Sparkles } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useChat } from '../../composables/useChat'
import { useHistory } from '../../composables/useHistory'
import { usePromptSuggestions } from '../../composables/usePromptSuggestions'
import { useConfigStore } from '../../stores/config'
import { useKeyboardShortcuts } from '../../composables/useKeyboardShortcuts'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'
import SearchBar from './SearchBar.vue'
import type { GenerationOptions } from '../../types'

const { t } = useI18n()
const { chatStore, sendMessage, cancelCurrentGeneration, startNewChat } = useChat()
const { searchQuery, showFavoritesOnly, filteredMessages, deleteMessage, toggleFavorite, clearSearch } = useHistory()
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

const isConfigured = computed(() => configStore.isConfigured)

// 加载提示文字轮播
const loadingTexts = computed(() => [
  t('aiThinking'),
  t('mixingColors'),
  t('drawingDetails'),
  t('almostDone'),
])
const currentTextIndex = ref(0)
const loadingDots = ref('')
let textInterval: ReturnType<typeof setInterval> | null = null
let dotsInterval: ReturnType<typeof setInterval> | null = null

const loadingText = computed(() => loadingTexts.value[currentTextIndex.value])

watch(() => chatStore.isLoading, (isLoading) => {
  if (isLoading) {
    // 开始文字轮播
    currentTextIndex.value = 0
    textInterval = setInterval(() => {
      currentTextIndex.value = (currentTextIndex.value + 1) % loadingTexts.value.length
    }, 3000)

    // 点点动画
    let dotCount = 0
    dotsInterval = setInterval(() => {
      dotCount = (dotCount + 1) % 4
      loadingDots.value = '.'.repeat(dotCount)
    }, 500)
  } else {
    // 停止轮播
    if (textInterval) {
      clearInterval(textInterval)
      textInterval = null
    }
    if (dotsInterval) {
      clearInterval(dotsInterval)
      dotsInterval = null
    }
  }
})

onUnmounted(() => {
  if (textInterval) clearInterval(textInterval)
  if (dotsInterval) clearInterval(dotsInterval)
})

// Quick start templates
const quickStartTemplates = computed(() => {
  const categories = ['people', 'landscape', 'animals', 'abstract'] as const
  return categories
    .map(cat => templates.value.find(t => t.category === cat))
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .slice(0, 4)
})

function getTemplateIcon(category: string) {
  const icons: Record<string, any> = {
    people: Users,
    landscape: Mountain,
    animals: Cat,
    abstract: Layers,
  }
  return icons[category] || Sparkles
}

async function handleSend(content: string, options: GenerationOptions) {
  try {
    await sendMessage(content, options)
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
    size: '1024x1024',
    quality: 'standard',
    n: 1,
  })
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

onMounted(() => {
  if (messagesContainer.value && chatStore.messages.length > 0) {
    scrollToBottom()
  }
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

/* Loading Indicator */
.loading-indicator {
  display: flex;
  justify-content: flex-start;
  margin-top: 12px;
}

.loading-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  width: auto;
  max-width: min(100%, 360px);
  padding: 10px 10px 10px 12px;
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, var(--color-bg-primary));
  border: 1px solid var(--color-border);
  border-radius: 999px;
  box-shadow: var(--shadow-sm);
}

.loading-content {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.loading-spinner {
  width: 18px;
  height: 18px;
  position: relative;
  flex-shrink: 0;
}

.spinner-ring {
  width: 100%;
  height: 100%;
  border: 2px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text-container {
  display: flex;
  align-items: baseline;
  min-width: 0;
}

.loading-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
}

.loading-dots {
  font-size: 13px;
  color: var(--color-text-tertiary);
  min-width: 16px;
}

.cancel-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 52px;
  height: 32px;
  padding: 0 12px;
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-base);
}

.cancel-pill:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
}

/* Transitions */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all var(--transition-slow);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* Responsive */
@media (max-width: 640px) {
  .messages-area {
    padding: 18px 16px 10px;
  }

  .loading-pill {
    max-width: 100%;
  }

  .quick-start-grid {
    grid-template-columns: 1fr;
  }

  .empty-title {
    font-size: 24px;
  }
}
</style>
