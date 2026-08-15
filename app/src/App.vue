<template>
  <a-config-provider :locale="locale" :theme="themeConfig">
    <router-view/>
  </a-config-provider>
</template>

<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import {ref, computed} from 'vue';
import {theme} from 'ant-design-vue';
import {useAppearanceStore} from '@/stores/appearanceStore';
import {storeToRefs} from 'pinia';

const locale = ref(zhCN);
const appearanceStore = useAppearanceStore();
const {effective} = storeToRefs(appearanceStore);

const themeConfig = computed(() => {
    const dark = effective.value === 'dark';
    return {
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
            colorPrimary: '#3964fe',
            colorInfo: '#3964fe',
            colorLink: '#3964fe',
            colorBgBase: dark ? '#0f1115' : '#f9fafb',
            colorBgContainer: dark ? '#16181d' : '#ffffff',
            colorBgElevated: dark ? '#1d2026' : '#ffffff',
            colorBgLayout: dark ? '#0f1115' : '#f9fafb',
            colorBorder: dark ? 'rgba(255,255,255,0.12)' : '#e2e4e8',
            colorBorderSecondary: dark ? 'rgba(255,255,255,0.08)' : '#eceef1',
            colorText: dark ? '#f2f4f8' : '#0f1115',
            colorTextSecondary: dark ? '#b6bcc6' : '#61666b',
            colorTextTertiary: dark ? '#8a919c' : '#81858c',
            colorTextQuaternary: dark ? '#6b7280' : '#9aa0a8',
            colorSuccess: dark ? '#4ade80' : '#16a34a',
            colorWarning: dark ? '#fbbf24' : '#d97706',
            colorError: dark ? '#f87171' : '#dc2626',
            borderRadius: 8,
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        },
    };
});
</script>
