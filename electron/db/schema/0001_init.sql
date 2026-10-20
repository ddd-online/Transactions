-- M0 最小 schema：只用于验证 node:sqlite 的建库/事务/校验链路。
-- M1 会替换为完整的 schema v1（ledger / transaction_record / stock_* / todo_* …）。
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

INSERT OR IGNORE INTO app_meta(key, value) VALUES ('schema_version', '1');
