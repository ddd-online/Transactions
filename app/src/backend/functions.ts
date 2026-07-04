import dayjs from "dayjs";

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
 * @param format 格式，默认为 'YYYY-MM-DD'
 * @returns 格式化后的时间字符串
 */
export function formatTimestamp(timestamp: number, format: string = 'YYYY-MM-DD'): string {
    return dayjs(timestamp * 1000).format(format);
}
