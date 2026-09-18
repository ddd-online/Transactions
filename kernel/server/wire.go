package server

import (
	"github.com/transactions/api"
	"github.com/transactions/dao"
	"github.com/transactions/service"
	"github.com/transactions/workspace"
)

// InitServices creates all service instances and wires them together.
// Returns the Handlers struct ready to be passed to api.ServeAPI.
// This is the compose root for the application.
func InitServices(mgr *workspace.WsManager) *api.Handlers {
	// ---- DAO layer ----
	trDao := dao.NewTransactionRecordDao()
	trTagDao := dao.NewTrTagDao()
	ledgerDao := dao.NewLedgerDao()
	categoryDao := dao.NewCategoryDao()
	tagDao := dao.NewTagDao()
	chartDao := dao.NewChartDao()
	keyEventDao := dao.NewKeyEventDao()
	keyEventImageDao := dao.NewKeyEventImageDao()
	diaryDao := dao.NewDiaryDao()
	trTemplateDao := dao.NewTransactionTemplateDao()
	stockDao := dao.NewStockDao()

	// ---- Service layer ----
	// Leaf services (no service deps)
	keyEventImageSvc := service.NewKeyEventImageService(keyEventImageDao)
	chartSvc := service.NewChartService(chartDao)
	trTemplateSvc := service.NewTrTemplateService(trTemplateDao)
	diarySvc := service.NewDiaryService(diaryDao)
	stockSvc := service.NewStockService(stockDao, service.NewTencentStockQuoteFetcher())

	// Services with service+dao deps
	tagSvc := service.NewTagService(tagDao, trTagDao)
	categorySvc := service.NewCategoryService(tagSvc, categoryDao)
	keyEventSvc := service.NewKeyEventService(keyEventImageSvc, keyEventDao)
	trSvc := service.NewTrService(keyEventSvc, trDao, trTagDao)
	ledgerSvc := service.NewLedgerService(ledgerDao, trDao, trTagDao, categoryDao, tagDao, chartDao, trTemplateDao, keyEventDao, keyEventImageDao, stockDao)

	return &api.Handlers{
		WsMgr:          mgr,
		LedgerSvc:      ledgerSvc,
		TrSvc:          trSvc,
		CategorySvc:    categorySvc,
		TagSvc:         tagSvc,
		ChartSvc:       chartSvc,
		KeyEventSvc:    keyEventSvc,
		KeyEventImgSvc: keyEventImageSvc,
		TrTemplateSvc:  trTemplateSvc,
		DiarySvc:       diarySvc,
		StockSvc:       stockSvc,
	}
}
