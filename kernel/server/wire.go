package server

import (
	"github.com/billadm/ai"
	"github.com/billadm/ai/tool"
	"github.com/billadm/api"
	"github.com/billadm/dao"
	"github.com/billadm/service"
)

// InitServices creates all service instances and wires them together.
// Returns the Handlers struct ready to be passed to api.ServeAPI.
// This is the compose root for the application.
func InitServices() *api.Handlers {
	// Services with no dependencies
	keyEventImageSvc := service.NewKeyEventImageService()
	chartSvc := service.NewChartService()
	trTemplateSvc := service.NewTrTemplateService()
	ledgerSvc := service.NewLedgerService()
	tagSvc := service.NewTagService()

	// Services that depend on other services
	categorySvc := service.NewCategoryService(tagSvc)
	keyEventSvc := service.NewKeyEventService(keyEventImageSvc)
	trSvc := service.NewTrService(keyEventSvc)

	// ---- AI module ----
	aiConfigDao := dao.NewAiConfigDao()
	aiMessageDao := dao.NewAiMessageDao()
	aiToolRegistry := tool.NewToolRegistry()

	// Register tools with injected service interfaces
	aiToolRegistry.Register(tool.NewQueryTransactionsTool(trSvc, ledgerSvc))
	aiToolRegistry.Register(tool.NewListLedgersTool(ledgerSvc))
	aiToolRegistry.Register(tool.NewListCategoriesTool(categorySvc, ledgerSvc))
	aiToolRegistry.Register(tool.NewListTagsTool(tagSvc, ledgerSvc))
	aiToolRegistry.Register(tool.NewGetKeyEventsTool(keyEventSvc, ledgerSvc))
	aiToolRegistry.Register(tool.NewGetTimeTool())
	aiToolRegistry.Register(tool.NewCalculateTool())

	aiChatService := ai.NewChatService(aiConfigDao, aiMessageDao, aiToolRegistry)

	return &api.Handlers{
		LedgerSvc:      ledgerSvc,
		TrSvc:          trSvc,
		CategorySvc:    categorySvc,
		TagSvc:         tagSvc,
		ChartSvc:       chartSvc,
		KeyEventSvc:    keyEventSvc,
		KeyEventImgSvc: keyEventImageSvc,
		TrTemplateSvc:  trTemplateSvc,
		ChatService:    aiChatService,
		AiConfigDao:    aiConfigDao,
		AiMessageDao:   aiMessageDao,
	}
}
