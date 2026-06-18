<script setup lang="ts">
import { Search, X, Star } from 'lucide-vue-next'

interface Props {
  searchQuery: string
  showFavoritesOnly: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'update:showFavoritesOnly': [value: boolean]
  clear: []
}>()

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:searchQuery', target.value)
}

function handleClear() {
  emit('update:searchQuery', '')
  emit('clear')
}

function toggleFavorites() {
  emit('update:showFavoritesOnly', !props.showFavoritesOnly)
}
</script>

<template>
  <div class="search-bar">
    <div class="search-input-wrapper">
      <Search :size="16" class="search-icon" />
      <input
        type="text"
        :value="searchQuery"
        @input="handleInput"
        placeholder="搜索消息..."
        class="search-input"
      />
      <button
        v-if="searchQuery"
        @click="handleClear"
        class="clear-btn"
        title="清除搜索"
      >
        <X :size="14" />
      </button>
    </div>

    <button
      @click="toggleFavorites"
      :class="['favorites-btn', { active: showFavoritesOnly }]"
      :title="showFavoritesOnly ? '显示全部' : '仅显示收藏'"
    >
      <Star :size="16" :fill="showFavoritesOnly ? 'currentColor' : 'none'" />
    </button>
  </div>
</template>

<style scoped>
.search-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-primary);
}

.search-input-wrapper {
  flex: 1;
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
  padding: 10px 36px 10px 36px;
  background: var(--color-bg-tertiary);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: 13px;
  outline: none;
  transition: all var(--transition-base);
}

.search-input:focus {
  background: var(--color-bg-primary);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.search-input::placeholder {
  color: var(--color-text-tertiary);
}

.clear-btn {
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-base);
}

.clear-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.favorites-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.favorites-btn:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  color: #f59e0b;
}

.favorites-btn.active {
  background: #fef3c7;
  border-color: #f59e0b;
  color: #f59e0b;
}

:root.dark .favorites-btn.active {
  background: #451a03;
  border-color: #f59e0b;
}
</style>
