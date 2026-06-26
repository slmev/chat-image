<template>
  <button
    @click="toggleLocale"
    class="btn-icon lang-btn"
    :aria-label="t('switchLanguage')"
    :title="locale === 'zh-CN' ? 'English' : '中文'"
  >
    <Languages :size="20" />
  </button>
  <button
    @click="toggleTheme"
    class="btn-icon"
    :aria-label="t('switchTheme')"
    :title="t('switchTheme')"
  >
    <Sun v-if="currentTheme === 'light'" :size="20" />
    <Moon v-else-if="currentTheme === 'dark'" :size="20" />
    <Monitor v-else :size="20" />
  </button>
</template>

<script setup lang="ts">
import { Sun, Moon, Monitor, Languages } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useTheme } from '../../composables/useTheme'

const { t, locale } = useI18n()
const { currentTheme, toggleTheme } = useTheme()

function toggleLocale() {
  const newLocale = locale.value === 'zh-CN' ? 'en' : 'zh-CN'
  locale.value = newLocale
  localStorage.setItem('chat-image-locale', newLocale)
}
</script>
