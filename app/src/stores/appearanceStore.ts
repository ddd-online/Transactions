import { defineStore } from "pinia";
import { ref } from "vue";

export type AppearanceMode = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';

const THEME_MEDIA = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && !!window.matchMedia(THEME_MEDIA).matches;
}

/**
 * 外观（浅色/深色/跟随系统）。
 * - 选择持久化在 Electron 配置（~/.transactions.json），经 electronAPI.getAppearance/setAppearance 读写。
 * - 生效主题写到 <html data-theme="light|dark">，全局 SCSS 双主题令牌据此切换。
 * - 'system' 模式下监听 prefers-color-scheme（Electron 中由 nativeTheme.themeSource 驱动）。
 */
export const useAppearanceStore = defineStore('appearance', () => {
    const appearance = ref<AppearanceMode>('system');
    const effective = ref<EffectiveTheme>(systemPrefersDark() ? 'dark' : 'light');

    let mediaQuery: MediaQueryList | null = null;
    let mediaHandler: ((e: MediaQueryListEvent) => void) | null = null;

    const applyTheme = () => {
        const theme: EffectiveTheme = appearance.value === 'system'
            ? (systemPrefersDark() ? 'dark' : 'light')
            : appearance.value;
        effective.value = theme;
        document.documentElement.setAttribute('data-theme', theme);
    };

    const init = async () => {
        try {
            const saved = await window.electronAPI?.getAppearance?.();
            if (saved === 'light' || saved === 'dark' || saved === 'system') {
                appearance.value = saved;
            }
        } catch {
            // 读取失败时回退到 system
        }
        applyTheme();
        if (typeof window.matchMedia === 'function') {
            mediaQuery = window.matchMedia(THEME_MEDIA);
            mediaHandler = () => applyTheme();
            mediaQuery.addEventListener('change', mediaHandler);
        }
    };

    const setAppearance = async (mode: AppearanceMode) => {
        appearance.value = mode;
        applyTheme();
        try {
            await window.electronAPI?.setAppearance?.(mode);
        } catch {
            // 持久化失败不影响本次会话
        }
    };

    const dispose = () => {
        if (mediaQuery && mediaHandler) {
            mediaQuery.removeEventListener('change', mediaHandler);
        }
        mediaQuery = null;
        mediaHandler = null;
    };

    return { appearance, effective, init, setAppearance, dispose };
});
