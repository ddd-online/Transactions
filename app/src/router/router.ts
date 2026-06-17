import {createMemoryHistory, createRouter} from 'vue-router';
import Layout from "@/components/Layout.vue";

const routes = [
  {
    path: '/',
    component: Layout,
    children: [
      {path: '', redirect: '/tr_view'},
      {
        name: '分类标签',
        path: 'category_tag_view',
        component: () => import('@/components/category_tag_view/CategoryTagView.vue')
      },
      {
        name: '消费记录',
        path: 'tr_view',
        component: () => import('@/components/tr_view/TransactionRecordView.vue')
      },
      {
        name: '数据分析',
        path: 'da_view',
        component: () => import('@/components/da_view/DataAnalysisView.vue')
      },
      {
        name: '关键事件',
        path: 'key_event_view',
        component: () => import('@/components/key_event_view/KeyEventView.vue')
      },
      {
        name: '应用设置',
        path: 'settings_view',
        component: () => import('@/components/settings_view/SettingsView.vue')
      },
    ]
  }
];

const router = createRouter({
  history: createMemoryHistory(),
  routes,
});

export default router;
