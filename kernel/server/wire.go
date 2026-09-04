package server

import (
	"github.com/transactions/ai"
	"github.com/transactions/ai/role"
	"github.com/transactions/ai/tool"
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

	// ---- AI module ----
	aiConfigDao := dao.NewAiConfigDao()
	aiApiConfigDao := dao.NewAiApiConfigDao()
	aiMessageDao := dao.NewAiMessageDao()
	aiConversationDao := dao.NewAiConversationDao()
	aiQuickCommandDao := dao.NewAiQuickCommandDao()
	aiToolRegistry := tool.NewToolRegistry()

	// Register tools with injected service interfaces
	aiToolRegistry.Register(tool.NewQueryTransactionsTool(trSvc, ledgerSvc))
	aiToolRegistry.Register(tool.NewListLedgersTool(ledgerSvc))
	aiToolRegistry.Register(tool.NewListCategoriesTool(categorySvc, ledgerSvc))
	aiToolRegistry.Register(tool.NewListTagsTool(tagSvc, ledgerSvc))
	aiToolRegistry.Register(tool.NewGetKeyEventsTool(keyEventSvc, ledgerSvc))
	aiToolRegistry.Register(tool.NewGetTimeTool())
	aiToolRegistry.Register(tool.NewCalculateTool())
	aiToolRegistry.Register(tool.NewQueryDiaryTool(diarySvc))
	aiToolRegistry.Register(tool.NewWriteDiaryTool(diarySvc))

	// Role registry
	roleRegistry := role.NewRegistry()
	roleRegistry.Register(role.NewFinanceRole())
	roleRegistry.Register(role.NewDiaryRole())

	aiChatService := ai.NewChatService(aiApiConfigDao, aiConfigDao, aiMessageDao, aiConversationDao, aiToolRegistry, roleRegistry)

	return &api.Handlers{
		WsMgr:             mgr,
		LedgerSvc:         ledgerSvc,
		TrSvc:             trSvc,
		CategorySvc:       categorySvc,
		TagSvc:            tagSvc,
		ChartSvc:          chartSvc,
		KeyEventSvc:       keyEventSvc,
		KeyEventImgSvc:    keyEventImageSvc,
		TrTemplateSvc:     trTemplateSvc,
		DiarySvc:          diarySvc,
		StockSvc:          stockSvc,
		ChatService:       aiChatService,
		AiConfigDao:       aiConfigDao,
		AiApiConfigDao:    aiApiConfigDao,
		AiMessageDao:      aiMessageDao,
		AiConversationDao: aiConversationDao,
		AiQuickCommandDao: aiQuickCommandDao,
		RoleRegistry:      roleRegistry,
	}
}
