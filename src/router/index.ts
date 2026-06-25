import { createRouter, createWebHashHistory } from 'vue-router'
import ChatContainer from '../components/Chat/ChatContainer.vue'

const SettingsPage = () => import('../components/Config/SettingsPage.vue')
const GalleryView = () => import('../components/Gallery/GalleryView.vue')

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'chat',
      component: ChatContainer,
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsPage,
    },
    {
      path: '/gallery',
      name: 'gallery',
      component: GalleryView,
    },
  ],
})
