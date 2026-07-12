package api

import (
	"github.com/billadm/ai"
	"github.com/billadm/dao"
	"github.com/billadm/service"
)

// Handlers holds all service interfaces and AI dependencies,
// injected via constructor by the compose root (server/wire.go).
// Each handler method receives its dependencies through the struct,
// not through package-level global variables.
type Handlers struct {
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

	// AI
	ChatService  *ai.ChatService
	AiConfigDao  dao.AiConfigDao
	AiMessageDao dao.AiMessageDao
}
