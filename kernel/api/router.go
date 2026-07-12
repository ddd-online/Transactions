package api

import (
	"github.com/gin-gonic/gin"
)

// ServeAPI registers all API routes on the Gin engine, using the injected Handlers.
func ServeAPI(ginServer *gin.Engine, h *Handlers) {
	// Endpoints that don't require an open workspace
	{
		ginServer.POST("/api/v1/workspace", h.openWorkspace)
		ginServer.POST("/api/v1/app/exit", exitApp)
	}

	v1 := ginServer.Group("/api/v1")
	v1.Use(RequireWorkspace())
	{
		// Ledgers: RESTful CRUD
		ledgers := v1.Group("/ledgers")
		{
			ledgers.GET("", Handle(h.listLedgers))
			ledgers.POST("", Handle(h.createLedger))
			ledgers.GET("/:id", Handle(h.getLedger))
			ledgers.PATCH("/:id", Handle(h.updateLedger))
			ledgers.DELETE("/:id", Handle(h.deleteLedger))
		}

		// Transactions: query uses POST for complex filters, others RESTful
		transactions := v1.Group("/transactions")
		{
			transactions.POST("/query", Handle(h.queryTransactions))
			transactions.POST("/query-chart-data", Handle(h.queryChartData))
			transactions.POST("/batch", Handle(h.batchCreateTransactions))
			transactions.POST("", Handle(h.createTransaction))
			transactions.DELETE("/:id", Handle(h.deleteTransaction))
			transactions.POST("/link", Handle(h.linkTransactionToKeyEvent))
			transactions.POST("/unlink", Handle(h.unlinkTransactionFromKeyEvent))
			transactions.GET("/linked/:date", Handle(h.listLinkedTransactions))
		}

		// Templates
		templates := v1.Group("/templates")
		{
			templates.POST("", Handle(h.createTemplate))
			templates.GET("", Handle(h.listTemplates))
			templates.DELETE("/:id", Handle(h.deleteTemplate))
			templates.PATCH("/:id/sort", Handle(h.updateTemplateSort))
		}

		// Categories
		v1.GET("/categories", Handle(h.listCategories))
		v1.POST("/categories", Handle(h.createCategory))
		v1.POST("/categories/initialize", Handle(h.initializeCategories))
		v1.DELETE("/categories/:name", Handle(h.deleteCategory))
		v1.PATCH("/categories/:name/sort", Handle(h.updateCategorySort))

		// Tags
		v1.GET("/tags", Handle(h.listTags))
		v1.POST("/tags", Handle(h.createTag))
		v1.DELETE("/tags/:name", Handle(h.deleteTag))
		v1.PATCH("/tags/:name/sort", Handle(h.updateTagSort))

		// Charts
		charts := v1.Group("/charts")
		{
			charts.POST("", Handle(h.createChart))
			charts.GET("", Handle(h.listCharts))
			charts.DELETE("/:id", Handle(h.deleteChart))
			charts.PATCH("", Handle(h.updateChart))
		}

		// Key Events
		keyEvents := v1.Group("/key-events")
		{
			keyEvents.GET("/year/:year", Handle(h.listKeyEventsByYear))
			keyEvents.GET("/dates/:year", Handle(h.listKeyEventDates))
			keyEvents.GET("/:date", Handle(h.getKeyEvent))
			keyEvents.POST("", Handle(h.upsertKeyEvent))
			keyEvents.DELETE("/:date", Handle(h.deleteKeyEvent))
			keyEvents.GET("/:date/images", Handle(h.listKeyEventImages))
			keyEvents.POST("/:date/images", Handle(h.addKeyEventImage))
		}

		keyEventImages := v1.Group("/key-event-images")
		{
			keyEventImages.DELETE("/:id", Handle(h.deleteKeyEventImage))
		}

		// Diary
		diary := v1.Group("/diary")
		{
			diary.GET("/dates", Handle(h.listDiaryDates))
			diary.GET("/:date", Handle(h.getDiary))
			diary.PUT("/:date", Handle(h.upsertDiary))
			diary.DELETE("/:date", Handle(h.deleteDiary))

			// Diary import
			importGroup := diary.Group("/import")
			{
				importGroup.POST("/scan", Handle(h.importScanDiary))
				importGroup.POST("/file", Handle(h.importOneDiary))
			}
		}

		// AI Chat (requires workspace)
		ai := v1.Group("/ai")
		{
			ai.POST("/chat", h.aiChat) // SSE — not wrapped in Handle()
			ai.GET("/roles", Handle(h.listRoles))
			ai.GET("/config", Handle(h.getAiConfig))
			ai.PUT("/config", Handle(h.updateAiConfig))
			ai.POST("/config/test", Handle(h.testAiConnection))
			ai.POST("/provider/fetch", Handle(h.fetchProvider))
			ai.GET("/messages", Handle(h.listAiMessages))
			ai.DELETE("/messages", Handle(h.clearAiMessages))
		}
	}
}

// JsonArg binds the request body as a JSON map. Returns false if parsing fails.
func JsonArg(c *gin.Context) (arg map[string]any, ok bool) {
	arg = make(map[string]any)
	if err := c.BindJSON(&arg); nil != err {
		return nil, false
	}
	return arg, true
}
