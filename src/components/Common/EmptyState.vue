<template>
  <div class="empty-state">
    <div class="empty-icon-wrapper">
      <component :is="icon" :size="iconSize" />
    </div>
    <h3 class="empty-title">{{ title }}</h3>
    <p v-if="description" class="empty-description">{{ description }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

interface Props {
  icon: Component
  title: string
  description?: string
  iconSize?: number
}

withDefaults(defineProps<Props>(), {
  description: '',
  iconSize: 48,
})
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon-wrapper {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-xl);
  color: var(--color-text-tertiary);
  margin-bottom: 20px;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.empty-description {
  font-size: 14px;
  color: var(--color-text-secondary);
  max-width: 400px;
  line-height: 1.6;
}
</style>
