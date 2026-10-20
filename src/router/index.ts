import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '@/pages/dashboard/index.vue'

const routes = [
  { name: 'home', path: '/', redirect: '/dashboard' },
  {
    name: 'dashboard',
    path: '/dashboard',
    component: Dashboard,
  },
  {
    name: 'accounts',
    path: '/accounts',
    component: () => import('@/pages/accounts/index.vue'),
  },
  {
    name: 'launcher',
    path: '/launcher',
    component: () => import('@/pages/launcher/index.vue'),
  },
  {
    name: 'settings',
    path: '/settings',
    component: () => import('@/pages/settings/index.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
