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
