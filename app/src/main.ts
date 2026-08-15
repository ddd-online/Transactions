import {createApp} from 'vue';
import {createPinia} from 'pinia';
import router from '@/router/router';
import App from '@/App.vue';
import {useAppearanceStore} from '@/stores/appearanceStore';
import VueECharts from 'vue-echarts';
import * as echarts from 'echarts/core';
import {CanvasRenderer} from 'echarts/renderers';
import {GridComponent, LegendComponent, TitleComponent, TooltipComponent} from 'echarts/components';
import {BarChart, LineChart, PieChart} from 'echarts/charts';
import 'ant-design-vue/dist/reset.css';
import '@/styles/index.scss';

// dayjs 中文支持
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

dayjs.locale('zh-cn');

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.use(router);
echarts.use([
    CanvasRenderer,
    TooltipComponent,
    GridComponent,
    LegendComponent,
    TitleComponent,
    LineChart,
    PieChart,
    BarChart]
);
app.component('v-chart', VueECharts);

// 挂载前先应用外观（避免首帧主题闪烁），随后立即挂载
useAppearanceStore(pinia).init().finally(() => {
    app.mount('#app');
});
