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
    colorPrimary: '#2D5A27',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',
    colorBgLayout: '#FAFAF8',
    colorBorder: '#E5E5E0',
    colorText: '#1A1A18',
    colorTextSecondary: '#6B6B66',
    colorSuccess: '#2D7D46',
    colorWarning: '#B8860B',
    colorError: '#C73E3A',
    borderRadius: 6,
    fontFamily: "'Source Serif 4', Georgia, 'Times New Roman', serif",
  },
}));
</script>
