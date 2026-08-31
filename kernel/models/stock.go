package models

// 股票交易资金事件类型
const (
	// StockEventAddPrincipal 追加本金
	StockEventAddPrincipal = "add_principal"
	// StockEventBuy 买入（预留：交易记录模块写入）
	StockEventBuy = "buy"
	// StockEventSell 卖出（预留：交易记录模块写入）
	StockEventSell = "sell"
)

// 持仓交易类型
const (
	// StockTradeOpen 建仓
	StockTradeOpen = "open"
	// StockTradeAdd 加仓
	StockTradeAdd = "add"
	// StockTradeReduce 减仓
	StockTradeReduce = "reduce"
	// StockTradeClose 清仓
	StockTradeClose = "close"
)

// StockAccount 股票账户（每个账本一个），本金以整数分存储。
type StockAccount struct {
	ID        string `gorm:"primaryKey;comment:账户UUID" json:"id"`
	LedgerID  string `gorm:"uniqueIndex;type:varchar(36);default:'';comment:所属账本ID" json:"ledgerId"`
	Principal int64  `gorm:"not null;default:0;comment:本金（分）" json:"principal"`
	CreatedAt int64  `gorm:"autoCreateTime:unix;not null;comment:创建时间" json:"createdAt"`
	UpdatedAt int64  `gorm:"autoUpdateTime:unix;not null;comment:更新时间" json:"updatedAt"`
}

func (StockAccount) TableName() string {
	return "tbl_billadm_stock_account"
}

// StockFeeSetting 交易费用设置（每个账本一份）。
// 费率以小数存储（如 万2.354 → 0.0002354），界面层负责与「万分之/%」展示互转。
type StockFeeSetting struct {
	ID              string  `gorm:"primaryKey;comment:设置UUID" json:"id"`
	LedgerID        string  `gorm:"uniqueIndex;type:varchar(36);default:'';comment:所属账本ID" json:"ledgerId"`
	CommissionRate  float64 `gorm:"not null;default:0.0002354;comment:佣金费率（万2.354）" json:"commissionRate"`
	MinCommission   int64   `gorm:"not null;default:500;comment:最低佣金（分/笔）" json:"minCommission"`
	StampDutyRate   float64 `gorm:"not null;default:0.0005;comment:印花税率（卖出收取，0.05%）" json:"stampDutyRate"`
	TransferFeeRate float64 `gorm:"not null;default:0.00001;comment:过户费率（买卖双向，仅沪市，0.001%）" json:"transferFeeRate"`
	CreatedAt       int64   `gorm:"autoCreateTime:unix;not null;comment:创建时间" json:"createdAt"`
	UpdatedAt       int64   `gorm:"autoUpdateTime:unix;not null;comment:更新时间" json:"updatedAt"`
}

func (StockFeeSetting) TableName() string {
	return "tbl_billadm_stock_fee_setting"
}

// StockFundRecord 资金变化记录：现金余额链条的来源，当前现金 = 末条记录余额。
// 买入/卖出事件由后续交易记录模块写入（NetPnl 记录卖出净盈亏，用于计算已实现总盈亏）。
type StockFundRecord struct {
	ID           string `gorm:"primaryKey;comment:记录UUID" json:"id"`
	LedgerID     string `gorm:"index:idx_stock_fund_ledger_date,priority:1;type:varchar(36);default:'';comment:所属账本ID" json:"ledgerId"`
	RecordDate   string `gorm:"index:idx_stock_fund_ledger_date,priority:2;type:varchar(10);not null;comment:日期 YYYY-MM-DD" json:"recordDate"`
	EventType    string `gorm:"type:varchar(32);not null;default:'';comment:事件类型" json:"eventType"`
	EventText    string `gorm:"type:varchar(200);not null;default:'';comment:事件描述" json:"eventText"`
	AmountChange int64  `gorm:"not null;default:0;comment:金额变化（分，带符号）" json:"amountChange"`
	CashBalance  int64  `gorm:"not null;default:0;comment:现金余额（分）" json:"cashBalance"`
	NetPnl       *int64 `gorm:"comment:卖出净盈亏（分），非卖出事件为空" json:"netPnl"`
	Remark       string `gorm:"type:varchar(500);not null;default:'';comment:备注" json:"remark"`
	CreatedAt    int64  `gorm:"autoCreateTime:unix;not null;comment:创建时间" json:"createdAt"`
}

func (StockFundRecord) TableName() string {
	return "tbl_billadm_stock_fund_record"
}

// StockPosition 股票持仓（每笔买卖实时维护，卖出时按总成本比例结转已实现盈亏）。
type StockPosition struct {
	ID          string `gorm:"primaryKey;comment:持仓UUID" json:"id"`
	LedgerID    string `gorm:"uniqueIndex:idx_stock_position_ledger_code,priority:1;type:varchar(36);default:'';comment:所属账本ID" json:"ledgerId"`
	StockCode   string `gorm:"uniqueIndex:idx_stock_position_ledger_code,priority:2;type:varchar(16);not null;comment:股票代码" json:"stockCode"`
	StockName   string `gorm:"type:varchar(64);not null;default:'';comment:股票名称" json:"stockName"`
	Quantity    int64  `gorm:"not null;default:0;comment:持仓数量（股）" json:"quantity"`
	TotalCost   int64  `gorm:"not null;default:0;comment:持仓总成本（分）" json:"totalCost"`
	RealizedPnl int64  `gorm:"not null;default:0;comment:已实现盈亏（分，该股累计）" json:"realizedPnl"`
	CreatedAt   int64  `gorm:"autoCreateTime:unix;not null;comment:创建时间" json:"createdAt"`
	UpdatedAt   int64  `gorm:"autoUpdateTime:unix;not null;comment:更新时间" json:"updatedAt"`
}

func (StockPosition) TableName() string {
	return "tbl_billadm_stock_position"
}

// StockTrade 股票交易记录（建仓/加仓/减仓/清仓）。
// Price/Amount/Fee 单位均为分；Lots 手数，Shares = Lots × 100。
type StockTrade struct {
	ID          string `gorm:"primaryKey;comment:交易UUID" json:"id"`
	LedgerID    string `gorm:"index:idx_stock_trade_ledger_code,priority:1;type:varchar(36);default:'';comment:所属账本ID" json:"ledgerId"`
	StockCode   string `gorm:"index:idx_stock_trade_ledger_code,priority:2;type:varchar(16);not null;comment:股票代码" json:"stockCode"`
	StockName   string `gorm:"type:varchar(64);not null;default:'';comment:股票名称" json:"stockName"`
	TradeType   string `gorm:"type:varchar(16);not null;default:'';comment:交易类型 open/add/reduce/close" json:"tradeType"`
	Price       int64  `gorm:"not null;default:0;comment:成交价（分/股）" json:"price"`
	Lots        int64  `gorm:"not null;default:0;comment:手数" json:"lots"`
	Shares      int64  `gorm:"not null;default:0;comment:股数（手数×100）" json:"shares"`
	Amount      int64  `gorm:"not null;default:0;comment:成交金额（分，价×股数）" json:"amount"`
	Fee         int64  `gorm:"not null;default:0;comment:交易费用（分）" json:"fee"`
	Commission  int64  `gorm:"not null;default:0;comment:佣金（分）" json:"commission"`
	StampDuty   int64  `gorm:"not null;default:0;comment:印花税（分，仅卖出收取）" json:"stampDuty"`
	TransferFee int64  `gorm:"not null;default:0;comment:过户费（分，仅沪市收取）" json:"transferFee"`
	RealizedPnl *int64 `gorm:"comment:卖出净盈亏（分），仅减仓/清仓非空" json:"realizedPnl"`
	TradeTime   int64  `gorm:"not null;default:0;comment:成交时间（Unix 秒）" json:"tradeTime"`
	Remark      string `gorm:"type:varchar(500);not null;default:'';comment:备注" json:"remark"`
	CreatedAt   int64  `gorm:"autoCreateTime:unix;not null;comment:创建时间" json:"createdAt"`
}

func (StockTrade) TableName() string {
	return "tbl_billadm_stock_trade"
}
