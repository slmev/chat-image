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
        <div class="empty-illustration">
          <div class="empty-icon-wrapper">
            <ImageIcon :size="48" />
          </div>
          <div class="empty-decoration">
            <Sparkles :size="20" class="sparkle-1" />
            <Sparkles :size="16" class="sparkle-2" />
            <Sparkles :size="24" class="sparkle-3" />
          </div>
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
        <div v-if="chatStore.isLoading" class="loading-indicator" role="status" :aria-label="t('generating')">
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
            class="btn-secondary cancel-btn"
          >
            {{ t('cancel') }}
          </button>
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
import { ImageIcon, Sparkles, Search, Users, Mountain, Cat, Layers } from 'lucide-vue-next'
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
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px 20px;
  text-align: center;
}

.empty-illustration {
  position: relative;
  margin-bottom: 24px;
}

.empty-icon-wrapper {
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-light);
  border-radius: var(--radius-xl);
  color: var(--color-primary);
}

.empty-decoration {
  position: absolute;
  inset: 0;
}

.sparkle-1 {
  position: absolute;
  top: -8px;
  right: -8px;
  color: var(--color-primary);
  animation: sparkle 2s ease-in-out infinite;
}

.sparkle-2 {
  position: absolute;
  bottom: -4px;
  left: -12px;
  color: var(--color-secondary);
  animation: sparkle 2s ease-in-out infinite 0.5s;
}

.sparkle-3 {
  position: absolute;
  top: 50%;
  right: -20px;
  color: var(--color-accent);
  animation: sparkle 2s ease-in-out infinite 1s;
}

@keyframes sparkle {
  0%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

.empty-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.empty-description {
  font-size: 15px;
  color: var(--color-text-secondary);
  margin-bottom: 32px;
  max-width: 400px;
}

.empty-icon {
  color: var(--color-text-tertiary);
  margin-bottom: 20px;
}

/* Quick Start Grid */
.quick-start-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  max-width: 480px;
  width: 100%;
}

.quick-start-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-base);
}

.quick-start-card:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.quick-start-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  color: var(--color-primary);
}

.quick-start-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

/* Loading Indicator */
.loading-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  margin-top: 16px;
}

.loading-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  position: relative;
}

.spinner-ring {
  width: 100%;
  height: 100%;
  border: 2.5px solid var(--color-border);
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
}

.loading-text {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.loading-dots {
  font-size: 14px;
  color: var(--color-text-secondary);
  min-width: 20px;
}

.cancel-btn {
  padding: 8px 16px;
  font-size: 13px;
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
  .quick-start-grid {
    grid-template-columns: 1fr;
  }

  .empty-icon-wrapper {
    width: 72px;
    height: 72px;
  }

  .empty-title {
    font-size: 20px;
  }
}
</style>
