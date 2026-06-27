<script setup lang="ts">
import { Search, X, Star } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

interface Props {
  searchQuery: string
  showFavoritesOnly: boolean
}

const props = defineProps<Props>()
const { t } = useI18n()

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
        :placeholder="t('searchMessages')"
        class="search-input"
        @input="handleInput"
      />
      <button v-if="searchQuery" class="clear-btn" :title="t('clearSearch')" @click="handleClear">
        <X :size="14" />
      </button>
    </div>

    <button
      :class="['favorites-btn', { active: showFavoritesOnly }]"
      :title="showFavoritesOnly ? t('showAll') : t('showFavoritesOnly')"
      @click="toggleFavorites"
    >
      <Star :size="16" :fill="showFavoritesOnly ? 'currentColor' : 'none'" />
    </button>
  </div>
</template>

<style scoped>
.search-bar {
  display: flex;
  gap: 8px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-primary) 94%, var(--color-bg-secondary));
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
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text-primary);
  font-size: 13px;
  outline: none;
  transition: all var(--transition-base);
}

.search-input:focus {
  background: var(--color-bg-primary);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary-light) 75%, transparent);
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
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 999px;
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
  background: color-mix(in srgb, var(--color-primary-light) 72%, var(--color-bg-primary));
  border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
  color: var(--color-primary);
}

:root.dark .favorites-btn.active {
  background: color-mix(in srgb, var(--color-primary-light) 72%, var(--color-bg-primary));
  border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
}
</style>
