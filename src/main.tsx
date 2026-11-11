import { createRoot } from 'react-dom/client'
import 'overlayscrollbars/overlayscrollbars.css'

import { App } from './App'
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/app-shell.css'
import './styles/app-layout.css'
import './styles/m0.css'
import './styles/transactions.css'
import './styles/category_tag.css'
import './styles/templates.css'
import './styles/data_analysis.css'
import './styles/event-shell.css'
import './styles/event-list.css'
import './styles/event-detail.css'
import './styles/event-related.css'
import './styles/diary.css'
import './styles/todo.css'
import './styles/stock-base.css'
import './styles/stock-account.css'
import './styles/stock-positions.css'
import './styles/stock-trade.css'
import './styles/stock-history.css'
import './styles/stock-ledger.css'
import './styles/stock-settings.css'
import './styles/stock-statistics.css'
import './styles/stock-responsive.css'
import './styles/stock-ladder.css'
import './styles/settings.css'
import './styles/settings-responsive.css'
import './styles/shell.css'
import './styles/antd.css'

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 容器')

createRoot(container).render(<App />)



