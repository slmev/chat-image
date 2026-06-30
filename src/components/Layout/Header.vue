<template>
  <header class="header" role="banner">
    <a href="#main-content" class="skip-link">{{ t('skipToContent') }}</a>
    <div class="header-content">
      <div class="header-left">
        <button
          class="btn-icon"
          :aria-label="t('history')"
          :title="t('history')"
          @click="$emit('toggle-sidebar')"
        >
          <Menu :size="20" />
        </button>

        <div class="logo-section">
          <img :src="appLogo" class="logo-mark" alt="" aria-hidden="true" />
          <h1 class="logo-text">
            <span class="logo-text-primary">{{ t('imageGen') }}</span>
            <span class="logo-text-secondary">Workspace</span>
          </h1>
        </div>
      </div>

      <nav ref="headerActionsRef" class="header-right" :aria-label="t('mainNav')">
        <button
          class="btn-secondary header-action"
          :aria-label="t('newChat')"
          :title="t('newChat')"
          @click="handleNewChat"
        >
          <Plus :size="18" />
          <span class="btn-label">{{ t('newChat') }}</span>
        </button>

        <button
          class="btn-icon"
          :aria-label="t('gallery')"
          :title="t('gallery')"
          @click="openGallery"
        >
          <ImageIcon :size="20" />
        </button>

        <button
          class="btn-icon"
          :aria-label="t('apiConfig')"
          :title="t('apiConfig')"
          @click="$emit('toggle-config')"
        >
          <Settings :size="20" />
        </button>

        <div class="desktop-actions">
          <ThemeToggle />
          <ExportImportPanel />
          <button
            v-if="chatStore.messageCount > 0"
            class="btn-icon danger"
            :aria-label="t('clearChat')"
            :title="t('clearChat')"
            @click="handleClearChat"
          >
            <Trash2 :size="20" />
          </button>
        </div>

        <div class="mobile-more">
          <button
            class="btn-icon"
            :aria-label="t('moreOptions')"
            :title="t('moreOptions')"
            :aria-expanded="showMoreMenu"
            @click="toggleMoreMenu"
          >
            <MoreHorizontal :size="20" />
          </button>

          <Transition name="more-menu">
            <div v-if="showMoreMenu" class="more-menu" role="menu">
              <div class="more-menu-row">
                <span class="more-menu-label">{{ t('switchLanguage') }}</span>
                <ThemeToggle />
              </div>
              <div class="more-menu-row">
                <span class="more-menu-label">{{ t('importExport') }}</span>
                <ExportImportPanel />
              </div>
              <button
                v-if="chatStore.messageCount > 0"
                class="more-menu-action danger"
                role="menuitem"
                @click="handleClearChat"
              >
                <Trash2 :size="18" />
                <span>{{ t('clearChat') }}</span>
              </button>
            </div>
          </Transition>
        </div>
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
import { onMounted, onUnmounted, ref } from 'vue'
import { Menu, Plus, Settings, Trash2, ImageIcon, MoreHorizontal } from 'lucide-vue-next'
import ThemeToggle from './ThemeToggle.vue'
import ExportImportPanel from '../Chat/ExportImportPanel.vue'
import ConfirmModal from '../Common/ConfirmModal.vue'
import { useChat } from '../../composables/useChat'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import appLogo from '../../assets/app-logo.svg'

const { t } = useI18n()
const router = useRouter()

const emit = defineEmits<{
  'toggle-config': []
  'toggle-sidebar': []
}>()

const { chatStore, clearChat, startNewChat } = useChat()
const showClearConfirm = ref(false)
const showMoreMenu = ref(false)
const headerActionsRef = ref<HTMLElement | null>(null)

function closeMoreMenu() {
  showMoreMenu.value = false
}

function toggleMoreMenu() {
  showMoreMenu.value = !showMoreMenu.value
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Node)) return
  if (headerActionsRef.value?.contains(target)) return
  closeMoreMenu()
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
})

async function handleNewChat() {
  try {
    closeMoreMenu()
    await startNewChat()
    await router.push({ name: 'chat' })
  } catch (error) {
    console.error('Start new chat failed:', error)
  }
}

async function openGallery() {
  closeMoreMenu()
  await router.push({ name: 'gallery' })
}

function handleClearChat() {
  closeMoreMenu()
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
  background: color-mix(in srgb, var(--color-bg-primary) 92%, transparent);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 30;
  flex-shrink: 0;
  backdrop-filter: blur(14px);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 16px;
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
  gap: 10px;
  min-width: 0;
}

.logo-mark {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-radius: 8px;
  box-shadow: 0 8px 18px -12px rgb(15 23 42 / 0.38);
}

.logo-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  white-space: nowrap;
}

.logo-text-primary {
  letter-spacing: 0;
}

.logo-text-secondary {
  color: var(--color-text-tertiary);
  font-size: 13px;
  font-weight: 500;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.desktop-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mobile-more {
  position: relative;
  display: none;
}

.header-action {
  padding-inline: 14px;
}

.btn-icon.danger:hover {
  background: #fef2f2;
  color: var(--color-error);
}

:root.dark .btn-icon.danger:hover {
  background: #450a0a;
}

.more-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 55;
  width: min(236px, calc(100vw - 16px));
  padding: 8px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
}

.more-menu-row,
.more-menu-action {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 6px 8px;
}

.more-menu-label,
.more-menu-action span {
  min-width: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.more-menu-action {
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.more-menu-action:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.more-menu-action.danger:hover {
  background: #fef2f2;
  color: var(--color-error);
}

:root.dark .more-menu-action.danger:hover {
  background: #450a0a;
}

.more-menu-enter-active,
.more-menu-leave-active {
  transition:
    opacity var(--transition-fast),
    transform var(--transition-fast);
}

.more-menu-enter-from,
.more-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 520px) {
  .header-content {
    gap: 8px;
    padding: 0 8px;
  }

  .header-left {
    flex: 1 1 auto;
    flex-shrink: 1;
    min-width: 0;
    overflow: hidden;
    gap: 6px;
  }

  .logo-section {
    gap: 8px;
  }

  .logo-mark {
    width: 30px;
    height: 30px;
    flex-basis: 30px;
  }

  .logo-text {
    display: none;
  }

  .header-right {
    display: grid;
    grid-template-columns: repeat(4, 34px);
    align-items: center;
    flex: 0 0 148px;
    gap: 4px;
  }

  .header-action {
    width: 34px;
    padding-inline: 0;
  }

  .header-action .btn-label {
    display: none;
  }

  .desktop-actions {
    display: none;
  }

  .mobile-more {
    display: block;
  }
}

@media (min-width: 640px) {
  .header-left {
    gap: 12px;
  }

  .header-right {
    gap: 8px;
  }

  .logo-text {
    font-size: 16px;
  }
}
</style>
