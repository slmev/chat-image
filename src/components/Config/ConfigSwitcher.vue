<template>
  <div ref="rootRef" :class="['config-switcher', `variant-${variant}`]">
    <!-- Inline label (options-bar variant) -->
    <label v-if="variant === 'inline'" class="option-label">{{ t('config') }}</label>

    <!-- Trigger -->
    <button
      type="button"
      :class="['switcher-trigger', { active: showMenu, empty: !hasConfigs }]"
      :aria-label="t('switchConfig')"
      :aria-haspopup="canExpand ? 'menu' : undefined"
      :aria-expanded="canExpand ? showMenu : undefined"
      :title="triggerTitle"
      @click="handleTriggerClick"
    >
      <Server :size="variant === 'header' ? 16 : 14" class="switcher-icon" aria-hidden="true" />
      <span class="switcher-name">{{ triggerLabel }}</span>
      <ChevronDown
        v-if="canExpand"
        :size="14"
        :class="['switcher-caret', { open: showMenu }]"
        aria-hidden="true"
      />
    </button>

    <!-- Dropdown -->
    <Transition name="switcher-menu">
      <div v-if="showMenu" class="switcher-menu" role="menu">
        <button
          v-for="profile in configStore.configs"
          :key="profile.id"
          type="button"
          role="menuitemradio"
          :aria-checked="profile.id === configStore.activeConfigId"
          :class="['switcher-item', { active: profile.id === configStore.activeConfigId }]"
          @click="handleSelect(profile.id)"
        >
          <Check
            :size="14"
            :class="['switcher-check', { visible: profile.id === configStore.activeConfigId }]"
            aria-hidden="true"
          />
          <span class="switcher-item-text">
            <span class="switcher-item-name">{{ profile.name }}</span>
            <span class="switcher-item-meta">{{ profile.model }}</span>
          </span>
        </button>

        <button type="button" role="menuitem" class="switcher-manage" @click="goToSettings">
          <Settings :size="14" aria-hidden="true" />
          <span>{{ t('manageConfigs') }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Check, ChevronDown, Server, Settings } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useConfigStore } from '../../stores/config'
import { useToast } from '../../composables/useToast'

withDefaults(
  defineProps<{
    variant?: 'header' | 'inline'
  }>(),
  {
    variant: 'header',
  },
)

const { t } = useI18n()
const router = useRouter()
const configStore = useConfigStore()
const toast = useToast()

const rootRef = ref<HTMLElement | null>(null)
const showMenu = ref(false)

const hasConfigs = computed(() => configStore.configs.length > 0)
// 只有一个配置时切换无意义，降级为只读标签；零配置时点击跳转设置页。
const canExpand = computed(() => configStore.configs.length > 1)

const triggerLabel = computed(() => {
  if (!hasConfigs.value) return t('notConfigured')
  return configStore.activeConfigProfile?.name || t('notConfigured')
})

const triggerTitle = computed(() =>
  hasConfigs.value ? `${t('activeConfig')}: ${triggerLabel.value}` : t('notConfigured'),
)

function closeMenu(): void {
  showMenu.value = false
}

function handleTriggerClick(): void {
  if (!hasConfigs.value) {
    goToSettings()
    return
  }
  if (!canExpand.value) return
  showMenu.value = !showMenu.value
}

async function handleSelect(id: string): Promise<void> {
  closeMenu()
  if (id === configStore.activeConfigId) return
  try {
    await configStore.activateConfig(id)
    toast.success(t('activeConfigSaved'))
  } catch (error) {
    console.error('Switch config failed:', error)
    toast.error(t('switchConfigFailed'))
  }
}

function goToSettings(): void {
  closeMenu()
  void router.push({ name: 'settings' })
}

function handleDocumentClick(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  if (rootRef.value?.contains(target)) return
  closeMenu()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && showMenu.value) {
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.config-switcher {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.variant-inline {
  gap: 6px;
}

.option-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
}

.switcher-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 180px;
  height: 34px;
  padding: 0 10px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);
}

.switcher-trigger:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  color: var(--color-text-primary);
}

.switcher-trigger.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.switcher-trigger.empty {
  color: var(--color-text-tertiary);
  border-style: dashed;
}

.switcher-icon {
  flex: 0 0 auto;
}

.switcher-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.switcher-caret {
  flex: 0 0 auto;
  transition: transform var(--transition-fast);
}

.switcher-caret.open {
  transform: rotate(180deg);
}

.variant-inline .switcher-trigger {
  height: 28px;
  max-width: 150px;
  padding: 0 8px;
  font-size: 12px;
}

.switcher-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 60;
  min-width: 220px;
  max-width: min(280px, calc(100vw - 24px));
  padding: 6px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
}

.variant-inline .switcher-menu {
  right: auto;
  left: 0;
  bottom: calc(100% + 6px);
  top: auto;
}

.switcher-item,
.switcher-manage {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: all var(--transition-base);
}

.switcher-item:hover,
.switcher-manage:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.switcher-item.active {
  color: var(--color-primary);
}

.switcher-check {
  flex: 0 0 auto;
  opacity: 0;
}

.switcher-check.visible {
  opacity: 1;
}

.switcher-item-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.switcher-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.switcher-item-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.switcher-manage {
  margin-top: 4px;
  border-top: 1px solid var(--color-border);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  padding-top: 10px;
  color: var(--color-text-tertiary);
}

.switcher-menu-enter-active,
.switcher-menu-leave-active {
  transition:
    opacity var(--transition-fast),
    transform var(--transition-fast);
}

.switcher-menu-enter-from,
.switcher-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.variant-inline .switcher-menu-enter-from,
.variant-inline .switcher-menu-leave-to {
  transform: translateY(4px);
}
</style>
