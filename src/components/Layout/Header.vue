<template>
  <header class="header" role="banner">
    <a href="#main-content" class="skip-link">{{ t('skipToContent') }}</a>
    <div class="header-content">
      <!-- Left: Logo & Title -->
      <div class="header-left">
        <button
          @click="$emit('toggle-sidebar')"
          class="btn-icon"
          :aria-label="t('history')"
          :title="t('history')"
        >
          <Menu :size="20" />
        </button>

        <div class="logo-section">
          <div class="logo-icon" aria-hidden="true">
            <Sparkles :size="20" />
          </div>
          <h1 class="logo-text">
            <span class="text-gradient">AI</span>
            <span>{{ t('imageGen') }}</span>
          </h1>
        </div>
      </div>

      <!-- Right: Actions -->
      <nav class="header-right" :aria-label="t('mainNav')">
        <!-- New Chat -->
        <button
          @click="handleNewChat"
          class="btn-ghost"
          :aria-label="t('newChat')"
          :title="t('newChat')"
        >
          <Plus :size="18" />
          <span class="btn-label">{{ t('newChat') }}</span>
        </button>

        <!-- Gallery -->
        <button
          @click="$emit('toggle-gallery')"
          class="btn-icon"
          :aria-label="t('gallery')"
          :title="t('gallery')"
        >
          <ImageIcon :size="20" />
        </button>

        <!-- Config -->
        <button
          @click="$emit('toggle-config')"
          class="btn-icon"
          :aria-label="t('apiConfig')"
          :title="t('apiConfig')"
        >
          <Settings :size="20" />
        </button>

        <!-- Theme Toggle -->
        <ThemeToggle />

        <!-- Export/Import -->
        <ExportImportPanel />

        <!-- Clear History -->
        <button
          v-if="chatStore.messageCount > 0"
          @click="handleClearChat"
          class="btn-icon danger"
          :aria-label="t('clearChat')"
          :title="t('clearChat')"
        >
          <Trash2 :size="20" />
        </button>
      </nav>
    </div>

    <!-- Clear Chat Confirm -->
    <ConfirmModal
      :is-open="showClearConfirm"
      :title="t('clearChat')"
      :message="t('clearChatConfirm')"
      :confirm-text="t('clear')"
      type="danger"
      @confirm="confirmClearChat"
      @cancel="showClearConfirm = false"
    />
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Menu, Sparkles, Plus, Settings, Trash2, ImageIcon } from 'lucide-vue-next'
import ThemeToggle from './ThemeToggle.vue'
import ExportImportPanel from '../Chat/ExportImportPanel.vue'
import ConfirmModal from '../Common/ConfirmModal.vue'
import { useChat } from '../../composables/useChat'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const emit = defineEmits<{
  'toggle-config': []
  'toggle-sidebar': []
  'toggle-gallery': []
}>()

const { chatStore, clearChat, startNewChat } = useChat()
const showClearConfirm = ref(false)

async function handleNewChat() {
  try {
    await startNewChat()
  } catch (error) {
    console.error('Start new chat failed:', error)
  }
}

function handleClearChat() {
  showClearConfirm.value = true
}

async function confirmClearChat() {
  try {
    await clearChat()
    showClearConfirm.value = false
  } catch (error) {
    console.error('Clear chat failed:', error)
  }
}
</script>

<style scoped>
.skip-link {
  position: absolute;
  top: -100%;
  left: 16px;
  z-index: 100;
  padding: 8px 16px;
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: top var(--transition-fast);
}

.skip-link:focus {
  top: 8px;
}

.header {
  height: var(--header-height);
  background: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 30;
  flex-shrink: 0;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 12px;
  max-width: 100%;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-primary);
  border-radius: var(--radius-md);
  color: white;
  flex-shrink: 0;
}

.logo-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-primary);
  display: flex;
  align-items: baseline;
  gap: 4px;
  white-space: nowrap;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.btn-label {
  display: none;
}

.btn-icon.danger:hover {
  background: #fef2f2;
  color: var(--color-error);
}

:root.dark .btn-icon.danger:hover {
  background: #450a0a;
}

@media (min-width: 640px) {
  .header-content {
    padding: 0 16px;
  }

  .header-left {
    gap: 12px;
  }

  .header-right {
    gap: 4px;
  }
}

@media (min-width: 768px) {
  .btn-label {
    display: inline;
  }

  .logo-text {
    font-size: 18px;
  }

  .logo-icon {
    width: 36px;
    height: 36px;
  }
}
</style>
