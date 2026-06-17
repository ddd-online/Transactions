import {createApp} from 'vue';
import {createPinia} from 'pinia';
import router from '@/router/router';
import App from '@/App.vue';
import VueECharts from 'vue-echarts';
import * as echarts from 'echarts/core';
import {CanvasRenderer} from 'echarts/renderers';
import {GridComponent, LegendComponent, TitleComponent, TooltipComponent} from 'echarts/components';
import {BarChart, LineChart, PieChart} from 'echarts/charts';
import Antd, {ConfigProvider} from 'ant-design-vue';
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
app.use(Antd);
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
app.component('ConfigProvider', ConfigProvider);
app.component('v-chart', VueECharts);

app.mount('#app');
