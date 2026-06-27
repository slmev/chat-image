<template>
  <Transition name="sidebar">
    <aside v-if="isOpen" class="sidebar" role="complementary" :aria-label="t('history')">
      <!-- Header -->
      <div class="sidebar-header">
        <h2 class="sidebar-title">{{ t('history') }}</h2>
        <button
          class="btn-icon"
          :aria-label="t('closeSidebar')"
          :title="t('closeSidebar')"
          @click="$emit('close')"
        >
          <X :size="18" />
        </button>
      </div>

      <!-- Search -->
      <div class="sidebar-search">
        <div class="search-input-wrapper">
          <Search :size="16" class="search-icon" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('searchHistory')"
            :aria-label="t('searchHistory')"
            class="search-input"
          />
        </div>
      </div>

      <!-- Tabs -->
      <div class="sidebar-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['tab-btn', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          <component :is="tab.icon" :size="16" />
          <span>{{ tab.label }}</span>
          <span v-if="tab.count > 0" class="tab-count">{{ tab.count }}</span>
        </button>
      </div>

      <!-- Content -->
      <div class="sidebar-content no-scrollbar">
        <!-- History List -->
        <template v-if="activeTab === 'history'">
          <div v-if="filteredHistory.length === 0" class="empty-state">
            <Clock :size="32" class="empty-icon" aria-hidden="true" />
            <p class="empty-text">{{ t('noHistory') }}</p>
          </div>
          <div v-else class="history-list">
            <div
              v-for="item in filteredHistory"
              :key="item.id"
              :class="['history-item', { active: item.id === currentChatId }]"
              @click="handleSelectHistory(item)"
            >
              <div class="history-item-content">
                <div class="history-item-icon">
                  <MessageSquare :size="16" />
                </div>
                <div class="history-item-info">
                  <input
                    v-if="editingHistoryId === item.id"
                    v-model="editingTitle"
                    type="text"
                    class="history-rename-input"
                    :aria-label="t('renameHistoryTitle')"
                    autofocus
                    @click.stop
                    @keydown.enter.prevent="commitRename(item.id)"
                    @keydown.esc.prevent="cancelRename"
                    @blur="commitRename(item.id)"
                  />
                  <p v-else class="history-item-title">{{ item.title }}</p>
                  <p class="history-item-time">{{ formatTime(item.timestamp) }}</p>
                </div>
              </div>
              <div class="history-item-actions">
                <button
                  class="action-btn"
                  :aria-label="t('renameHistory')"
                  :title="t('renameHistory')"
                  @click.stop="startRename(item)"
                >
                  <Pencil :size="14" />
                </button>
                <button
                  :class="['action-btn', { 'is-favorite': item.isFavorite }]"
                  :aria-label="item.isFavorite ? t('unfavorite') : t('favorite')"
                  :title="item.isFavorite ? t('unfavorite') : t('favorite')"
                  @click.stop="toggleFavorite(item.id)"
                >
                  <Star :size="14" :fill="item.isFavorite ? 'currentColor' : 'none'" />
                </button>
                <button
                  class="action-btn delete"
                  :aria-label="t('delete')"
                  :title="t('delete')"
                  @click.stop="deleteHistory(item.id)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- Favorites List -->
        <template v-if="activeTab === 'favorites'">
          <div v-if="filteredFavorites.length === 0" class="empty-state">
            <Star :size="32" class="empty-icon" aria-hidden="true" />
            <p class="empty-text">{{ t('noFavorites') }}</p>
          </div>
          <div v-else class="history-list">
            <div
              v-for="item in filteredFavorites"
              :key="item.id"
              :class="['history-item', { active: item.id === currentChatId }]"
              @click="handleSelectHistory(item)"
            >
              <div class="history-item-content">
                <div class="history-item-icon favorite">
                  <Star :size="16" fill="currentColor" />
                </div>
                <div class="history-item-info">
                  <input
                    v-if="editingHistoryId === item.id"
                    v-model="editingTitle"
                    type="text"
                    class="history-rename-input"
                    :aria-label="t('renameHistoryTitle')"
                    autofocus
                    @click.stop
                    @keydown.enter.prevent="commitRename(item.id)"
                    @keydown.esc.prevent="cancelRename"
                    @blur="commitRename(item.id)"
                  />
                  <p v-else class="history-item-title">{{ item.title }}</p>
                  <p class="history-item-time">{{ formatTime(item.timestamp) }}</p>
                </div>
              </div>
              <div class="history-item-actions">
                <button
                  class="action-btn"
                  :aria-label="t('renameHistory')"
                  :title="t('renameHistory')"
                  @click.stop="startRename(item)"
                >
                  <Pencil :size="14" />
                </button>
                <button
                  class="action-btn is-favorite"
                  :aria-label="t('unfavorite')"
                  :title="t('unfavorite')"
                  @click.stop="toggleFavorite(item.id)"
                >
                  <StarOff :size="14" />
                </button>
                <button
                  class="action-btn delete"
                  :aria-label="t('delete')"
                  :title="t('delete')"
                  @click.stop="deleteHistory(item.id)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Footer -->
      <div class="sidebar-footer">
        <button class="btn-ghost clear-btn" @click="clearAll">
          <Trash2 :size="16" />
          <span>{{ t('clearAll') }}</span>
        </button>
      </div>
    </aside>
  </Transition>

  <!-- Overlay for mobile -->
  <Transition name="fade">
    <div v-if="isOpen" class="sidebar-overlay" @click="$emit('close')" />
  </Transition>

  <!-- Clear All Confirm -->
  <ConfirmModal
    :is-open="showClearConfirm"
    :title="t('clearHistory')"
    :message="t('clearHistoryConfirm')"
    :confirm-text="t('clear')"
    type="danger"
    @confirm="confirmClearAll"
    @cancel="showClearConfirm = false"
  />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, Search, Clock, Star, StarOff, MessageSquare, Pencil, Trash2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useHistory } from '../../composables/useHistory'
import { useChat } from '../../composables/useChat'
import ConfirmModal from '../Common/ConfirmModal.vue'
import type { ChatHistory } from '../../types'

const { t, locale } = useI18n()

interface Props {
  isOpen: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

const {
  historyList,
  searchHistory,
  deleteHistoryItem,
  clearHistory,
  toggleHistoryFavorite,
  renameHistoryItem,
} = useHistory()
const { clearChat, loadChat } = useChat()

const searchQuery = ref('')
const activeTab = ref<'history' | 'favorites'>('history')
const currentChatId = ref<string | null>(null)
const showClearConfirm = ref(false)
const editingHistoryId = ref<string | null>(null)
const editingTitle = ref('')

const tabs = computed(() => [
  {
    id: 'history' as const,
    label: t('historyTab'),
    icon: Clock,
    count: historyList.value.length,
  },
  {
    id: 'favorites' as const,
    label: t('favorites'),
    icon: Star,
    count: historyList.value.filter((h) => h.isFavorite).length,
  },
])

const filteredHistory = computed(() => {
  let list = historyList.value
  if (searchQuery.value) {
    list = searchHistory(searchQuery.value)
  }
  return [...list].sort((a, b) => b.timestamp - a.timestamp)
})

const filteredFavorites = computed(() => {
  let list = historyList.value.filter((h) => h.isFavorite)
  if (searchQuery.value) {
    list = list.filter((h) => h.title.toLowerCase().includes(searchQuery.value.toLowerCase()))
  }
  return list.sort((a, b) => b.timestamp - a.timestamp)
})

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return t('justNow')
  if (diff < 3600000) return t('minutesAgo', { n: Math.floor(diff / 60000) })
  if (diff < 86400000) return t('hoursAgo', { n: Math.floor(diff / 3600000) })
  if (diff < 604800000) return t('daysAgo', { n: Math.floor(diff / 86400000) })

  return date.toLocaleDateString(locale.value, {
    month: 'short',
    day: 'numeric',
  })
}

async function handleSelectHistory(item: ChatHistory) {
  currentChatId.value = item.id
  await loadChat(item.id)
  emit('close')
}

async function toggleFavorite(id: string) {
  try {
    await toggleHistoryFavorite(id)
  } catch (error) {
    console.error('Toggle history favorite failed:', error)
  }
}

function startRename(item: ChatHistory) {
  editingHistoryId.value = item.id
  editingTitle.value = item.title
}

function cancelRename() {
  editingHistoryId.value = null
  editingTitle.value = ''
}

async function commitRename(id: string) {
  if (editingHistoryId.value !== id) return

  const nextTitle = editingTitle.value.trim()
  cancelRename()
  if (!nextTitle) return

  try {
    await renameHistoryItem(id, nextTitle)
  } catch (error) {
    console.error('Rename history failed:', error)
  }
}

async function deleteHistory(id: string) {
  try {
    await deleteHistoryItem(id)
    if (currentChatId.value === id) {
      currentChatId.value = null
    }
  } catch (error) {
    console.error('Delete history failed:', error)
  }
}

function clearAll() {
  showClearConfirm.value = true
}

async function confirmClearAll() {
  try {
    await clearHistory()
    currentChatId.value = null
    await clearChat()
    showClearConfirm.value = false
  } catch (error) {
    console.error('Clear history failed:', error)
  }
}
</script>

<style scoped>
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--sidebar-width);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, var(--color-bg-primary));
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  z-index: 40;
  box-shadow: var(--shadow-md);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border);
}

.sidebar-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.sidebar-search {
  padding: 12px 14px;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: var(--color-text-tertiary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 12px 10px 38px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-size: 13px;
  color: var(--color-text-primary);
  outline: none;
  transition: all var(--transition-base);
}

.search-input::placeholder {
  color: var(--color-text-tertiary);
}

.search-input:focus {
  background: var(--color-bg-primary);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.sidebar-tabs {
  display: flex;
  padding: 0 10px;
  gap: 4px;
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.tab-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.tab-btn.active {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  box-shadow: inset 0 0 0 1px var(--color-border);
}

.tab-count {
  padding: 2px 6px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
}

.tab-btn.active .tab-count {
  background: color-mix(in srgb, var(--color-primary-light) 72%, var(--color-bg-primary));
  color: var(--color-primary);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--color-text-tertiary);
}

.empty-icon {
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 14px;
  cursor: pointer;
  transition: all var(--transition-base);
}

.history-item:hover {
  background: var(--color-bg-primary);
  border-color: var(--color-border);
}

.history-item:focus-within {
  background: var(--color-bg-primary);
  border-color: var(--color-border);
}

.history-item.active {
  background: var(--color-bg-primary);
  border-color: color-mix(in srgb, var(--color-primary) 28%, var(--color-border));
}

.history-item-content {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.history-item-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  color: var(--color-text-secondary);
}

.history-item-icon.favorite {
  background: #fef3c7;
  color: #f59e0b;
}

:root.dark .history-item-icon.favorite {
  background: #451a03;
  color: #fbbf24;
}

.history-item-info {
  flex: 1;
  min-width: 0;
}

.history-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-rename-input {
  width: 100%;
  min-width: 0;
  height: 24px;
  padding: 3px 7px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-primary);
  border-radius: 7px;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 500;
  outline: none;
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.history-item-time {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin-top: 2px;
}

.history-item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-base);
}

.history-item:hover .history-item-actions {
  opacity: 1;
}

.history-item:focus-within .history-item-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.action-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.action-btn.is-favorite {
  color: #f59e0b;
}

.action-btn.delete:hover {
  background: #fef2f2;
  color: var(--color-error);
}

:root.dark .action-btn.delete:hover {
  background: #450a0a;
}

.sidebar-footer {
  padding: 12px 14px;
  border-top: 1px solid var(--color-border);
}

.clear-btn {
  width: 100%;
  justify-content: center;
  color: var(--color-text-tertiary);
}

.clear-btn:hover {
  color: var(--color-error);
}

/* Overlay */
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  z-index: 35;
}

/* Transitions */
.sidebar-enter-active,
.sidebar-leave-active {
  transition: transform var(--transition-slow);
}

.sidebar-enter-from,
.sidebar-leave-to {
  transform: translateX(-100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-base);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Mobile */
@media (max-width: 768px) {
  .sidebar {
    width: 85%;
    max-width: 320px;
  }
}
</style>
