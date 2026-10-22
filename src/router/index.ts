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
    name: 'gacha',
    path: '/gacha',
    component: () => import('@/pages/gacha/index.vue'),
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
  {
    name: 'sign',
    path: '/sign',
    // 裸页,供签到日例子窗口加载
    meta: { bare: true },
    component: () => import('@/pages/sign/index.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
