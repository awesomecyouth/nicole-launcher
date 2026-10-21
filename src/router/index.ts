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
    name: 'settings',
    path: '/settings',
    component: () => import('@/pages/settings/index.vue'),
  },
  {
    name: 'geetest',
    path: '/geetest',
    // 裸页(无侧边栏布局),供验证子窗口加载
    meta: { bare: true },
    component: () => import('@/pages/geetest/index.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
