<template>
  <a-config-provider :locale="locale" :theme="themeConfig">
    <router-view/>
  </a-config-provider>
</template>

<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import {ref, computed} from 'vue';

const locale = ref(zhCN);

const themeConfig = computed(() => ({
  token: {
    colorPrimary: '#4A8E70',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',
    colorBgLayout: '#F9F8F6',
    colorBorder: '#E4E1DB',
    colorText: '#1D1D1B',
    colorTextSecondary: '#5C5C55',
    colorSuccess: '#3D8C5E',
    colorWarning: '#C68E30',
    colorError: '#D9705A',
    borderRadius: 8,
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  },
}));
</script>
