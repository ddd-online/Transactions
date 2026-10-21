-- schema v1（新应用的第一份结构；源库的 15 条历史迁移不搬过来）。
--
-- 单位约定（与 ADR 0006 一致）：
--   金额 = 整数「分」，列名以 _cents 结尾
--   股价 = 整数「厘」，列名以 _milli 结尾
--   时间 = Unix 秒，列名以 _at 结尾
--   日期 = TEXT 'YYYY-MM-DD'，列名以 _date 结尾
--
-- v1 刻意不加外键：源库可能有孤儿行，服务层按既有语义做手工级联；
-- 导入器会校验孤儿并报告，等数据证明干净后再追加 FK 迁移。

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_record (
  transaction_id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  flags TEXT,
  key_event_date TEXT NOT NULL DEFAULT '',
  transaction_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tr_key_event_date ON transaction_record(key_event_date);
CREATE INDEX IF NOT EXISTS idx_tr_ledger_at ON transaction_record(ledger_id, transaction_at);

CREATE TABLE IF NOT EXISTS transaction_record_tag (
  ledger_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (ledger_id, transaction_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_tr_tag_transaction ON transaction_record_tag(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tr_tag_ledger ON transaction_record_tag(ledger_id);

CREATE TABLE IF NOT EXISTS category (
  ledger_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_category_ledger_name_type
  ON category(ledger_id, name, transaction_type);

CREATE TABLE IF NOT EXISTS tag (
  ledger_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  category_transaction_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_ledger_name_cattype
  ON tag(ledger_id, name, category_transaction_type);

CREATE TABLE IF NOT EXISTS transaction_template (
  template_id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT,
  flags TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chart (
  chart_id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL,
  title TEXT NOT NULL,
  granularity TEXT NOT NULL,
  chart_lines TEXT NOT NULL,
  chart_type TEXT NOT NULL DEFAULT 'line',
  is_preset INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chart_ledger ON chart(ledger_id);

CREATE TABLE IF NOT EXISTS key_event (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT,
  content TEXT,
  color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ledger_id TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_key_event_ledger_date ON key_event(ledger_id, date);

CREATE TABLE IF NOT EXISTS key_event_image (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL,
  file_path TEXT NOT NULL DEFAULT '',
  thumb_path TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_key_event_image_ledger_date
  ON key_event_image(ledger_id, event_date);

CREATE TABLE IF NOT EXISTS diary_entry (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  content TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  mood TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ledger_id TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diary_entry_ledger_date ON diary_entry(ledger_id, date);

CREATE TABLE IF NOT EXISTS stock_account (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  principal_cents INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_account_ledger ON stock_account(ledger_id);

CREATE TABLE IF NOT EXISTS stock_fee_setting (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  commission_rate REAL NOT NULL DEFAULT 0.0002354,
  min_commission_cents INTEGER NOT NULL DEFAULT 500,
  stamp_duty_rate REAL NOT NULL DEFAULT 0.0005,
  transfer_fee_rate REAL NOT NULL DEFAULT 0.00001,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_fee_setting_ledger ON stock_fee_setting(ledger_id);

CREATE TABLE IF NOT EXISTS stock_fund_record (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  record_date TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT '',
  event_text TEXT NOT NULL DEFAULT '',
  amount_change_cents INTEGER NOT NULL DEFAULT 0,
  cash_balance_cents INTEGER NOT NULL DEFAULT 0,
  net_pnl_cents INTEGER,
  remark TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_fund_ledger_date ON stock_fund_record(ledger_id, record_date);

CREATE TABLE IF NOT EXISTS stock_position (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  stock_code TEXT NOT NULL,
  stock_name TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 0,
  total_cost_cents INTEGER NOT NULL DEFAULT 0,
  realized_pnl_cents INTEGER NOT NULL DEFAULT 0,
  review TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  tag TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_position_ledger_code ON stock_position(ledger_id, stock_code);

CREATE TABLE IF NOT EXISTS stock_trade (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  stock_code TEXT NOT NULL,
  stock_name TEXT NOT NULL DEFAULT '',
  trade_type TEXT NOT NULL DEFAULT '',
  round_id TEXT NOT NULL DEFAULT '',
  order_id TEXT NOT NULL DEFAULT '',
  order_seq INTEGER NOT NULL DEFAULT 1,
  price_milli INTEGER NOT NULL DEFAULT 0,
  lots INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  commission_cents INTEGER NOT NULL DEFAULT 0,
  stamp_duty_cents INTEGER NOT NULL DEFAULT 0,
  transfer_fee_cents INTEGER NOT NULL DEFAULT 0,
  realized_pnl_cents INTEGER,
  trade_time INTEGER NOT NULL DEFAULT 0,
  remark TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  round_commission_rate REAL,
  round_min_commission_cents INTEGER,
  round_stamp_duty_rate REAL,
  round_transfer_fee_rate REAL
);
CREATE INDEX IF NOT EXISTS idx_stock_trade_ledger_order ON stock_trade(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_trade_round ON stock_trade(round_id);
CREATE INDEX IF NOT EXISTS idx_stock_trade_ledger_code ON stock_trade(ledger_id, stock_code);

CREATE TABLE IF NOT EXISTS stock_trade_history (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  stock_code TEXT NOT NULL,
  stock_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_trade_history_ledger_code
  ON stock_trade_history(ledger_id, stock_code);

CREATE TABLE IF NOT EXISTS stock_trade_round (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  stock_code TEXT NOT NULL,
  history_id TEXT NOT NULL,
  round_no INTEGER NOT NULL,
  opened_at INTEGER NOT NULL DEFAULT 0,
  closed_at INTEGER NOT NULL DEFAULT 0,
  tag TEXT NOT NULL DEFAULT '分析',
  review TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_trade_round_history_no
  ON stock_trade_round(history_id, round_no);
CREATE INDEX IF NOT EXISTS idx_stock_trade_round_ledger_code
  ON stock_trade_round(ledger_id, stock_code);

CREATE TABLE IF NOT EXISTS stock_trade_tag_setting (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_trade_tag_setting_ledger
  ON stock_trade_tag_setting(ledger_id);

CREATE TABLE IF NOT EXISTS stock_operation (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_operation_ledger ON stock_operation(ledger_id, created_at);

CREATE TABLE IF NOT EXISTS stock_review_setting (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  template TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_review_setting_ledger ON stock_review_setting(ledger_id);

CREATE TABLE IF NOT EXISTS stock_day_review (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  stock_code TEXT NOT NULL,
  round_id TEXT NOT NULL DEFAULT '',
  review_date TEXT NOT NULL,
  review TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_day_review_round_date
  ON stock_day_review(ledger_id, stock_code, round_id, review_date);

CREATE TABLE IF NOT EXISTS todo_card (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_todo_card_ledger ON todo_card(ledger_id, created_at);

CREATE TABLE IF NOT EXISTS todo_item (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  card_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  urgency INTEGER NOT NULL DEFAULT 0,
  importance INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'doing',
  completed_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_todo_item_card ON todo_item(ledger_id, card_id, status);
CREATE INDEX IF NOT EXISTS idx_todo_item_status ON todo_item(ledger_id, status, completed_at);

CREATE TABLE IF NOT EXISTS todo_progress (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL DEFAULT '',
  item_id TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_todo_progress_item ON todo_progress(ledger_id, item_id, created_at);

INSERT OR IGNORE INTO app_meta(key, value) VALUES ('schema_version', '1');
