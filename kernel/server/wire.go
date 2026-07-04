package server

import (
	"github.com/billadm/dao"
	"github.com/billadm/service"
)

// InitServices creates all service instances and wires them together.
// This is the compose root for the application.
// Must be called once before the server starts.
func InitServices() {
	// DAOs (bottom layer)
	trDao := dao.NewTransactionRecordDao()
	trTagDao := dao.NewTrTagDao()

	// Services with no dependencies
	keyEventImageSvc := service.NewKeyEventImageService()
	chartSvc := service.NewChartService()
	trTemplateSvc := service.NewTrTemplateService()

	// Services that depend on DAOs
	tagSvc := service.NewTagService(trTagDao)
	ledgerSvc := service.NewLedgerService(trDao, trTagDao)
	trSvc := service.NewTrService(trDao, trTagDao)

	// Services that depend on other services
	categorySvc := service.NewCategoryService(tagSvc)
	keyEventSvc := service.NewKeyEventService(keyEventImageSvc)

	// Wire into package-level accessors
	service.SetLedgerService(ledgerSvc)
	service.SetTrService(trSvc)
	service.SetCategoryService(categorySvc)
	service.SetTagService(tagSvc)
	service.SetChartService(chartSvc)
	service.SetKeyEventService(keyEventSvc)
	service.SetKeyEventImageService(keyEventImageSvc)
	service.SetTrTemplateService(trTemplateSvc)
}
