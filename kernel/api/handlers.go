package api

import (
	"github.com/transactions/service"
	"github.com/transactions/workspace"
)

// Handlers holds all service interfaces,
// injected via constructor by the compose root (server/wire.go).
// Each handler method receives its dependencies through the struct,
// not through package-level global variables.
type Handlers struct {
	WsMgr *workspace.WsManager

	// Services
	LedgerSvc      service.LedgerService
	TrSvc          service.TransactionRecordService
	CategorySvc    service.CategoryService
	TagSvc         service.TagService
	ChartSvc       service.ChartService
	KeyEventSvc    service.KeyEventService
	KeyEventImgSvc service.KeyEventImageService
	TrTemplateSvc  service.TransactionTemplateService
	DiarySvc       service.DiaryService
	StockSvc       service.StockService
}
