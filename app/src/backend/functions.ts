import dayjs from "dayjs";
import type {Category, Tag, TransactionRecord, TrQueryCondition, TrQueryResult} from "@/types/billadm";
import {createTrForLedger, deleteTrById, queryTrOnCondition, linkTrToKeyEvent, unlinkTrFromKeyEvent, fetchLinkedTransactions} from "@/backend/api/tr.ts";
import NotificationUtil from "@/backend/notification.ts";
import {queryCategory, createCategory, deleteCategory, updateCategorySort, initializeCategories} from "@/backend/api/category.ts";
import {queryTags, createTag, deleteTag, updateTagSort} from "@/backend/api/tag.ts";
import {createTemplate, queryTemplates, deleteTemplate, updateTemplateSort} from "@/backend/api/template.ts";
import type {TransactionTemplateDto} from "@/backend/api/template.ts";

export function centsToYuan(cents: number): string {
    // 确保是整数
    if (!Number.isInteger(cents)) {
        console.warn('传入的不是整数分值:', cents);
    }
    // 转为带两位小数的字符串
    return (cents / 100).toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: false
    });
}

export function yuanToCents(yuanStr: string): number {
    // 去除空格
    yuanStr = yuanStr.trim();

    // 支持负号
    const isNegative = yuanStr.startsWith('-');
    if (isNegative) yuanStr = yuanStr.slice(1);

    // 拆分整数和小数部分
    let [integerPart = '0', decimalPart = '00'] = yuanStr.split('.');

    // 小数部分最多取两位，不足补零，超过截断
    decimalPart = (decimalPart + '00').substring(0, 2);

    // 防止非数字字符
    if (!/^\d+$/.test(integerPart) || !/^\d{2}$/.test(decimalPart)) {
        throw new Error('无效的金额格式');
    }

    const totalCents = parseInt(integerPart, 10) * 100 + parseInt(decimalPart, 10);
    return isNegative ? -totalCents : totalCents;
}

/**
 * 将秒级时间戳转换为格式化时间字符串
 * @param timestamp 秒级时间戳
 * @param format 格式，默认为 'YYYY-MM-DD HH:mm:ss'
 * @returns 格式化后的时间字符串
 */
export function formatTimestamp(timestamp: number, format: string = 'YYYY-MM-DD'): string {
    return dayjs(timestamp * 1000).format(format);
}

/**
 * 消费记录
 */
export async function getTrOnCondition(condition: TrQueryCondition): Promise<TrQueryResult> {
    try {
        return await queryTrOnCondition(condition);
    } catch (error) {
        NotificationUtil.error('查询消费记录失败', `${error}`);
        return {
            items: [],
            total: 0,
            trStatistics: {
                income: 0,
                expense: 0,
                transfer: 0,
            }
        };
    }
}

export async function createTransactionRecord(tr: TransactionRecord) {
    try {
        await createTrForLedger(tr);
    } catch (error) {
        NotificationUtil.error('创建消费记录失败', `${error}`);
    }
}

export async function deleteTransactionRecord(trId: string) {
    try {
        await deleteTrById(trId);
    } catch (error) {
        NotificationUtil.error('删除消费记录失败', `${error}`);
    }
}

export async function updateTransactionRecord(tr: TransactionRecord) {
    try {
        await deleteTrById(tr.transactionId);
        await createTrForLedger(tr);
    } catch (error) {
        NotificationUtil.error('更新消费记录失败', `${error}`);
    }
}

/**
 * 分类与标签
 */
export async function getCategoryByType(trType: string, ledgerId?: string): Promise<Category[]> {
    try {
        return await queryCategory(trType, ledgerId);
    } catch (error) {
        NotificationUtil.error(`查询 ${trType} 消费类型失败`, `${error}`);
        return [];
    }
}

export async function getTagsByCategory(categoryTransactionType: string, ledgerId?: string): Promise<Tag[]> {
    try {
        return await queryTags(categoryTransactionType, ledgerId);
    } catch (error) {
        NotificationUtil.error(`查询 ${categoryTransactionType} 消费标签失败`, `${error}`);
        return [];
    }
}

/**
 * 模板
 */
export async function getTemplatesByLedgerId(ledgerId: string) {
    try {
        return await queryTemplates(ledgerId);
    } catch (error) {
        NotificationUtil.error('查询模板失败', `${error}`);
        return [];
    }
}

export async function saveTemplate(data: TransactionTemplateDto) {
    try {
        return await createTemplate(data);
    } catch (error) {
        NotificationUtil.error('保存模板失败', `${error}`);
        return null;
    }
}

export async function removeTemplate(templateId: string) {
    try {
        await deleteTemplate(templateId);
    } catch (error) {
        NotificationUtil.error('删除模板失败', `${error}`);
    }
}

export async function reorderTemplate(templateId: string, ledgerId: string, sortOrder: number) {
    try {
        await updateTemplateSort(templateId, ledgerId, sortOrder);
    } catch (error) {
        NotificationUtil.error('更新模板排序失败', `${error}`);
        throw error;
    }
}

/**
 * 创建分类
 */
export async function addCategory(ledgerId: string, name: string, transactionType: string) {
    try {
        await createCategory(ledgerId, name, transactionType);
    } catch (error) {
        NotificationUtil.error('创建分类失败', `${error}`);
        throw error;
    }
}

/**
 * 删除分类
 */
export async function removeCategory(name: string, transactionType: string, ledgerId: string) {
    try {
        await deleteCategory(name, transactionType, ledgerId);
    } catch (error) {
        NotificationUtil.error('删除分类失败', `${error}`);
        throw error;
    }
}

/**
 * 初始化分类标签（为指定账本创建默认分类和标签）
 */
export async function initializeCategoriesForLedger(ledgerId: string): Promise<{ categories: number; tags: number }> {
    try {
        return await initializeCategories(ledgerId);
    } catch (error) {
        NotificationUtil.error('初始化分类标签失败', `${error}`);
        throw error;
    }
}

/**
 * 创建标签
 */
export async function addTag(name: string, categoryTransactionType: string) {
    try {
        await createTag(name, categoryTransactionType);
    } catch (error) {
        NotificationUtil.error('创建标签失败', `${error}`);
        throw error;
    }
}

/**
 * 删除标签
 */
export async function removeTag(name: string, categoryTransactionType: string, ledgerId: string) {
    try {
        await deleteTag(name, categoryTransactionType, ledgerId);
    } catch (error) {
        NotificationUtil.error('删除标签失败', `${error}`);
        throw error;
    }
}

/**
 * 更新分类排序
 */
export async function reorderCategory(name: string, transactionType: string, sortOrder: number, ledgerId: string) {
    try {
        await updateCategorySort(name, transactionType, sortOrder, ledgerId);
    } catch (error) {
        NotificationUtil.error('更新分类排序失败', `${error}`);
        throw error;
    }
}

/**
 * 更新标签排序
 */
export async function reorderTag(name: string, categoryTransactionType: string, sortOrder: number, ledgerId: string) {
    try {
        await updateTagSort(name, categoryTransactionType, sortOrder, ledgerId);
    } catch (error) {
        NotificationUtil.error('更新标签排序失败', `${error}`);
        throw error;
    }
}

export async function linkTransactionToKeyEvent(transactionId: string, date: string): Promise<boolean> {
    try {
        await linkTrToKeyEvent(transactionId, date);
        NotificationUtil.success('关联成功');
        return true;
    } catch (error) {
        NotificationUtil.error('关联失败', `${error}`);
        return false;
    }
}

export async function unlinkTransactionFromKeyEvent(transactionId: string): Promise<boolean> {
    try {
        await unlinkTrFromKeyEvent(transactionId);
        NotificationUtil.success('已解除关联');
        return true;
    } catch (error) {
        NotificationUtil.error('解除关联失败', `${error}`);
        return false;
    }
}

export async function getLinkedTransactions(date: string): Promise<TransactionRecord[]> {
    try {
        return await fetchLinkedTransactions(date);
    } catch (error) {
        NotificationUtil.error('查询关联交易失败', `${error}`);
        return [];
    }
}
