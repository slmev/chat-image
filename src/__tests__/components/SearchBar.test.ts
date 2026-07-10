import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SearchBar from '../../components/Chat/SearchBar.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        searchMessages: 'Search messages',
        clearSearch: 'Clear search',
        showAll: 'Show all',
        showFavoritesOnly: 'Show favorites only',
      })[key] ?? key,
  }),
}))

describe('SearchBar accessibility', () => {
  it('labels search, clear, and favorites controls', () => {
    const wrapper = mount(SearchBar, {
      props: {
        searchQuery: 'cat',
        showFavoritesOnly: true,
      },
    })

    expect(wrapper.get('input').attributes('aria-label')).toBe('Search messages')
    expect(wrapper.get('.clear-btn').attributes('aria-label')).toBe('Clear search')
    expect(wrapper.get('.favorites-btn').attributes('aria-label')).toBe('Show all')
    expect(wrapper.get('.favorites-btn').attributes('aria-pressed')).toBe('true')
  })
})
