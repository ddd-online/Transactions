import dayjs, {Dayjs} from 'dayjs';
import type {RangeValue, TimeRangeTypeLabel, TimeRangeTypeValue} from "@/types/transactions";

/**
 * 设置日期为当天的开始: 00:00:00.000
 */
export function setToStartOfDay(date: Dayjs): Dayjs {
    return date.startOf('day');
}

/**
 * 设置日期为当天的结束: 23:59:59.999
 */
export function setToEndOfDay(date: Dayjs): Dayjs {
    return date.endOf('day');
}

/**
 * 获取今天的时间范围 [开始, 结束]
 */
export function getTodayRange(): [Dayjs, Dayjs] {
    const today = dayjs();
    return [setToStartOfDay(today), setToEndOfDay(today)];
}

/**
 * 获取本周的时间范围 [开始, 结束]
 * 默认周一为一周开始（符合中国习惯）
 */
export function getThisWeekRange(): [Dayjs, Dayjs] {
    const start = dayjs().startOf('week').add(1, 'day'); // 周一
    const end = dayjs().endOf('week').add(1, 'day');     // 周日
    return [start, end];
}

/**
 * 获取上周的时间范围 [开始, 结束]
 */
export function getLastWeekRange(): [Dayjs, Dayjs] {
    const start = dayjs().subtract(1, 'week').startOf('week').add(1, 'day'); // 上周一
    const end = dayjs().subtract(1, 'week').endOf('week').add(1, 'day');     // 上周日
    return [start, end];
}

/**
 * 获取本月的时间范围 [开始, 结束]
 */
export function getThisMonthRange(date: Dayjs = dayjs()): [Dayjs, Dayjs] {
    return [date.startOf('month'), date.endOf('month')];
}

/**
 * 获取上月的时间范围 [开始, 结束]
 */
export function getLastMonthRange(date: Dayjs = dayjs()): [Dayjs, Dayjs] {
    const prevMonth = date.subtract(1, 'month');
    return [prevMonth.startOf('month'), prevMonth.endOf('month')];
}

/**
 * 获取今年的时间范围 [开始, 结束]
 */
export function getThisYearRange(date: Dayjs = dayjs()): [Dayjs, Dayjs] {
    return [date.startOf('year'), date.endOf('year')];
}

// -------------------------------
// 时间区间滑动函数
// -------------------------------

/**
 * 向前或向后调整时间范围一天
 */
function shiftOneDay(start: Dayjs, end: Dayjs, direction: number): [Dayjs, Dayjs] {
    return [
        start.add(direction, 'day'),
        end.add(direction, 'day')
    ];
}

/**
 * 向前或向后调整时间范围一周
 */
function shiftOneWeek(start: Dayjs, end: Dayjs, direction: number): [Dayjs, Dayjs] {
    return [
        start.add(7 * direction, 'day'),
        end.add(7 * direction, 'day')
    ];
}

/**
 * 向前或向后调整时间范围一月
 */
function shiftOneMonth(start: Dayjs, end: Dayjs, direction: number): [Dayjs, Dayjs] {
    return [
        start.add(direction, 'month').startOf('month'),
        end.add(direction, 'month').endOf('month')
    ];
}

/**
 * 向前或向后调整时间范围一年
 */
function shiftOneYear(start: Dayjs, end: Dayjs, direction: number): [Dayjs, Dayjs] {
    return [
        start.add(direction, 'year').startOf('year'),
        end.add(direction, 'year').endOf('year')
    ];
}

/**
 * 判断两个时间之间的时间粒度，并返回向前/向后一个周期的新区间
 */
function shiftPeriod(
    startDate: Dayjs,
    endDate: Dayjs,
    direction: number,
    TimeRangeValue: TimeRangeTypeValue
): [Dayjs, Dayjs] {
    switch (TimeRangeValue) {
        case 'date':
            // 判断是否为一周
            if (endDate.diff(startDate, 'day') === 6) {
                return shiftOneWeek(startDate, endDate, direction);
            }
            return shiftOneDay(startDate, endDate, direction);
        case 'month':
            return shiftOneMonth(startDate, endDate, direction);
        case 'year':
            return shiftOneYear(startDate, endDate, direction);
        default:
            return shiftOneDay(startDate, endDate, direction);
    }
}

/**
 * 获取下一个周期的时间范围
 */
export function getNextPeriod(
    startDate: Dayjs,
    endDate: Dayjs,
    TimeRangeValue: TimeRangeTypeValue
): [Dayjs, Dayjs] {
    return shiftPeriod(startDate, endDate, 1, TimeRangeValue);
}

/**
 * 获取上一个周期的时间范围
 */
export function getPrevPeriod(
    startDate: Dayjs,
    endDate: Dayjs,
    TimeRangeValue: TimeRangeTypeValue
): [Dayjs, Dayjs] {
    return shiftPeriod(startDate, endDate, -1, TimeRangeValue);
}

/**
 * 转化Dayjs时间范围为unix秒级时间戳范围
 */
export function convertToUnixTimeRange(timeRange: [Dayjs, Dayjs]): [number, number] {
    if (!Array.isArray(timeRange) || timeRange.length < 2) {
        return [setToStartOfDay(dayjs()).unix(), setToEndOfDay(dayjs()).unix()]
    }
    const startTs = timeRange[0]
    const endTs = timeRange[1]
    return [setToStartOfDay(startTs).unix(), setToEndOfDay(endTs).unix()]
}

/**
 * 规范化时间范围：先向前再向后，确保对齐到标准周期
 */
export function normalizeTimeRange(timeRange: RangeValue, timeRangeType: TimeRangeTypeLabel): [Dayjs, Dayjs] | undefined {
    if (!timeRange) return undefined;
    let start: Dayjs = timeRange[0], end: Dayjs = timeRange[1];
    switch (timeRangeType) {
        case '日':
            start = start.startOf('day');
            end = end.endOf('day');
            break;
        case '月':
            start = start.startOf('month');
            end = end.endOf('month');
            break;
        case '年':
            start = start.startOf('year');
            end = end.endOf('year');
            break;
    }
    return [setToStartOfDay(start), setToEndOfDay(end)];
}