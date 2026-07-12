package server

import (
	"github.com/billadm/ai"
	"github.com/billadm/ai/role"
	"github.com/billadm/ai/tool"
	"github.com/billadm/api"
	"github.com/billadm/dao"
	"github.com/billadm/service"
	"github.com/billadm/workspace"
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

	// ---- Service layer ----
	// Leaf services (no service deps)
	keyEventImageSvc := service.NewKeyEventImageService(keyEventImageDao)
	chartSvc := service.NewChartService(chartDao)
	trTemplateSvc := service.NewTrTemplateService(trTemplateDao)
	diarySvc := service.NewDiaryService(diaryDao)

	// Services with service+dao deps
	tagSvc := service.NewTagService(tagDao, trTagDao)
	categorySvc := service.NewCategoryService(tagSvc, categoryDao)
	keyEventSvc := service.NewKeyEventService(keyEventImageSvc, keyEventDao)
	trSvc := service.NewTrService(keyEventSvc, trDao, trTagDao)
	ledgerSvc := service.NewLedgerService(ledgerDao, trDao, trTagDao)

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
	aiToolRegistry.Register(tool.NewQueryDiaryTool(diarySvc))
	aiToolRegistry.Register(tool.NewWriteDiaryTool(diarySvc))

	// Role registry
	roleRegistry := role.NewRegistry()
	roleRegistry.Register(role.NewFinanceRole())
	roleRegistry.Register(role.NewDiaryRole())

	aiChatService := ai.NewChatService(aiConfigDao, aiMessageDao, aiToolRegistry, roleRegistry)

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
		ChatService:    aiChatService,
		AiConfigDao:    aiConfigDao,
		AiMessageDao:   aiMessageDao,
		RoleRegistry:   roleRegistry,
	}
}
