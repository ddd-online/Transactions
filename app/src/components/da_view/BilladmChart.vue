<template>
  <v-chart
    v-if="option"
    :option="option"
    :autoresize="true"
    class="billadm-chart"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TimeSeriesData, ChartLine } from '@/backend/chart'
import { TransactionTypeToColor } from '@/backend/constant'

import type { EChartsOption } from 'echarts'

interface Props {
  lines: ChartLine[]
  data: TimeSeriesData[]
  xField: string
  yField: string
  title: string
}

const props = defineProps<Props>()

const getThemeColors = () => {
  const styles = getComputedStyle(document.documentElement)
  return {
    labelFill: styles.getPropertyValue('--billadm-color-text-major').trim() || '#1A1A18',
    titleFill: styles.getPropertyValue('--billadm-color-text-major').trim() || '#1A1A18',
    bgColor: styles.getPropertyValue('--billadm-color-major-background').trim() || '#FFFFFF',
  }
}

const option = computed<EChartsOption | null>(() => {
  if (!props.data.length) return null

  const themeColors = getThemeColors()

  // 提取唯一的标签和构建series
  const labels = [...new Set(props.data.map(d => d.label))]
  const times = [...new Set(props.data.map(d => d.time))].sort()

  // 构建 label → type 映射
  const labelTypeMap = new Map<string, string>()
  props.data.forEach(d => {
    if (!labelTypeMap.has(d.label)) {
      labelTypeMap.set(d.label, d.type)
    }
  })

  // 检查是否所有曲线类型都不同（用于颜色映射）
  const tts = props.lines.map(l => l.transactionType)
  const allTypesUnique = new Set(tts).size === tts.length

  const xAxisTitle = props.xField === 'time'
    ? (props.title.includes('月度') ? '月份' : '年份')
    : props.xField

  const series = labels.map(label => {
    const seriesData = times.map(t => {
      const point = props.data.find(d => d.time === t && d.label === label)
      return point ? point.amount : null
    })

    const lineType = labelTypeMap.get(label) || ''
    const color = allTypesUnique
      ? TransactionTypeToColor.get(lineType) || undefined
      : undefined

    return {
      name: label,
      type: 'line' as const,
      data: seriesData,
      smooth: false,
      lineStyle: { width: 2 },
      symbol: 'circle',
      symbolSize: 6,
      itemStyle: {
        color,
        borderColor: themeColors.bgColor,
        borderWidth: 1,
      },
    }
  })

  return {
    title: {
      // title is handled externally by the parent component
      show: false,
    },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) => {
        if (typeof value === 'number') {
          return `¥${value.toFixed(2)}`
        }
        return String(value ?? '')
      },
    },
    legend: {
      data: labels,
      bottom: 0,
      textStyle: {
        color: themeColors.labelFill,
        fontSize: 13,
      },
    },
    grid: {
      left: 60,
      right: 30,
      top: 20,
      bottom: 40,
    },
    xAxis: {
      type: 'category',
      data: times,
      name: xAxisTitle,
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: {
        color: themeColors.titleFill,
        fontSize: 14,
      },
      axisLabel: {
        color: themeColors.labelFill,
        fontSize: 12,
      },
    },
    yAxis: {
      type: 'value',
      name: '金额（元）',
      nameTextStyle: {
        color: themeColors.titleFill,
        fontSize: 14,
      },
      axisLabel: {
        color: themeColors.labelFill,
        fontSize: 12,
        formatter: (value: number) => `¥${value}`,
      },
      min: 0,
    },
    series,
  }
})
</script>

<style scoped>
.billadm-chart {
  width: 100%;
  height: 100%;
}
</style>
