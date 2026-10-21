import { createRoot } from 'react-dom/client'

import { App } from './App'
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/app.css'
import './styles/m0.css'
import './styles/transactions.css'
import './styles/category_tag.css'
import './styles/templates.css'
import './styles/dashboard.css'
import './styles/data_analysis.css'
import './styles/key_event.css'
import './styles/diary.css'
import './styles/todo.css'
import './styles/stock.css'
import './styles/settings.css'
import './styles/shell.css'

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 容器')

createRoot(container).render(<App />)


