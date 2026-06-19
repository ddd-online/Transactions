<template>
  <div ref="containerRef" class="billadm-chart"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { Chart } from '@antv/g2'
import type { TimeSeriesData, ChartLine } from '@/backend/chart'
import { TransactionTypeToColor } from '@/backend/constant'

interface Props {
  lines: ChartLine[]
  data: TimeSeriesData[]
  xField: string
  yField: string
  title: string
}

const props = defineProps<Props>()

const containerRef = ref<HTMLDivElement | null>(null)
let chart: Chart | null = null

// Get theme colors from design system CSS custom properties
const getThemeColors = () => {
  const styles = getComputedStyle(document.documentElement)
  return {
    labelFill: styles.getPropertyValue('--billadm-color-text-major').trim() || '#1A1A18',
    titleFill: styles.getPropertyValue('--billadm-color-text-major').trim() || '#1A1A18',
  }
}

const initChart = () => {
  if (!containerRef.value || !props.data.length) return

  // 销毁旧图表
  if (chart) {
    chart.destroy()
    chart = null
  }

  // 获取时间轴标题
  const xAxisTitle = props.xField === 'time' ? (props.title.includes('月度') ? '月份' : '年份') : props.xField

  // 获取主题颜色
  const themeColors = getThemeColors()

  chart = new Chart({
    container: containerRef.value,
    autoFit: true,
    data: props.data,
  })

  // 如果存在相同交易类型则让图表随机使用颜色以区分显示
  let tts = props.lines.map(l => l.transactionType);
  if (new Set(tts).size == tts.length) {
    chart.scale('color', {
      domain: props.lines.map(l => l.label),
      range: props.lines.map(l => TransactionTypeToColor.get(l.transactionType)!),
    })
  }

  // 设置图例显示label名称
  chart.scale('label', {
    domain: props.data.map(d => d.label),
    range: props.data.map(d => TransactionTypeToColor.get(d.type)!),
  })

  chart.scale('y', {
    domainMin: 0,
    nice: true
  })

  chart.axis('x', {
    title: xAxisTitle,
    titleFill: themeColors.titleFill,
    labelFontSize: 15,
    titleFontSize: 16
  })
  chart.axis('y', {
    title: '金额（元）',
    titleFill: themeColors.titleFill,
    labelFontSize: 15,
    titleFontSize: 16
  })

  // 图例配置
  chart.legend('color', {
    itemLabelFill: themeColors.labelFill,
  })

  chart
    .line()
    .encode('x', props.xField)
    .encode('y', props.yField)
    .encode('color', 'label')
    .style('lineWidth', 2)

  chart
    .point()
    .encode('x', props.xField)
    .encode('y', props.yField)
    .encode('color', 'label')
    .style('size', 4)
    .style('stroke', getComputedStyle(document.documentElement).getPropertyValue('--billadm-color-major-background').trim() || '#FFFFFF')
    .style('lineWidth', 1)
    .tooltip(false)

  chart.render()
}

onMounted(async () => {
  await nextTick()
  initChart()
})

onUnmounted(() => {
  if (chart) {
    chart.destroy()
    chart = null
  }
})

watch(() => props.data, () => {
  initChart()
}, { deep: true })
</script>

<style scoped>
.billadm-chart {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
