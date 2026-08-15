import { useAppearanceStore } from '@/stores/appearanceStore';
import { TransactionTypeToColor } from '@/backend/constant';

/**
 * 主题感知的交易类型颜色。
 *
 * 交易语义色（收入/支出/转账）随浅色/深色主题变化，且只在交易数据处使用。
 * CSS 侧直接用 `--billadm-color-income/expense/transfer` 变量即可；
 * 但 canvas 图表（ECharts）与部分 JS 内联样式读不到 CSS 变量，
 * 需要通过 getComputedStyle 解析当前主题下的实际色值。
 */
function readCssVar(name: string, fallback: string): string {
    if (typeof document === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

export function resolveTransactionTypeColor(type: string): string {
    const fallback = TransactionTypeToColor.get(type) || '#61666b';
    if (type === 'income') return readCssVar('--billadm-color-income', fallback);
    if (type === 'expense') return readCssVar('--billadm-color-expense', fallback);
    if (type === 'transfer') return readCssVar('--billadm-color-transfer', fallback);
    return fallback;
}

/**
 * 返回一个渲染期可用的解析器：内部读取 appearanceStore.effective，
 * 使主题切换时 Vue 重新渲染并解析出新色值（模板中直接调用即可）。
 */
export function useTransactionTypeColor(): (type: string) => string {
    const store = useAppearanceStore();
    return (type: string) => {
        // 依赖追踪：主题切换时触发重渲染
        store.effective;
        return resolveTransactionTypeColor(type);
    };
}
