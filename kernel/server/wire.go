package server

import (
	"github.com/billadm/ai"
	"github.com/billadm/ai/tool"
	"github.com/billadm/api"
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

	// ---- AI module ----
	aiConfigDao := dao.NewAiConfigDao()
	aiMessageDao := dao.NewAiMessageDao()
	aiToolRegistry := tool.NewToolRegistry()

	// Register 6 read-only tools
	aiToolRegistry.Register(tool.NewQueryTransactionsTool())
	aiToolRegistry.Register(tool.NewListLedgersTool())
	aiToolRegistry.Register(tool.NewListCategoriesTool())
	aiToolRegistry.Register(tool.NewListTagsTool())
	aiToolRegistry.Register(tool.NewQueryChartDataTool())
	aiToolRegistry.Register(tool.NewGetKeyEventsTool())

	aiChatService := ai.NewChatService(aiConfigDao, aiMessageDao, aiToolRegistry)

	// Wire into API package
	api.SetChatService(aiChatService)
	api.SetAiConfigDao(aiConfigDao)
}
