package api

import (
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models"
)

func ServeAPI(ginServer *gin.Engine) {
	v1 := ginServer.Group("/api/v1")
	v1.Use(RequireWorkspace())
	{
		// App control
		v1.POST("/app/exit", exitApp)

		// Ledgers: RESTful CRUD
		ledgers := v1.Group("/ledgers")
		{
			ledgers.GET("", listLedgers)
			ledgers.POST("", createLedger)
			ledgers.GET("/:id", getLedger)
			ledgers.PATCH("/:id", updateLedger)
			ledgers.DELETE("/:id", deleteLedger)
		}

		// Transactions: query uses POST for complex filters, others RESTful
		transactions := v1.Group("/transactions")
		{
			transactions.POST("/query", queryTransactions)
			transactions.POST("/query-chart-data", queryChartData)
			transactions.POST("/batch", batchCreateTransactions)
			transactions.POST("", createTransaction)
			transactions.DELETE("/:id", deleteTransaction)
			transactions.POST("/link", linkTransactionToKeyEvent)
			transactions.POST("/unlink", unlinkTransactionFromKeyEvent)
			transactions.GET("/linked/:date", listLinkedTransactions)
		}

		// Templates
		templates := v1.Group("/templates")
		{
			templates.POST("", createTemplate)
			templates.GET("", listTemplates)
			templates.DELETE("/:id", deleteTemplate)
			templates.PATCH("/:id/sort", updateTemplateSort)
		}

		// Categories: GET by type query param
		v1.GET("/categories", listCategories)
		v1.POST("/categories", createCategory)
		v1.POST("/categories/initialize", initializeCategories)
		v1.DELETE("/categories/:name", deleteCategory)
		v1.PATCH("/categories/:name/sort", updateCategorySort)

		// Tags: GET by category query param
		v1.GET("/tags", listTags)
		v1.POST("/tags", createTag)
		v1.DELETE("/tags/:name", deleteTag)
		v1.PATCH("/tags/:name/sort", updateTagSort)

		// Workspace
		workspace := v1.Group("/workspace")
		{
			workspace.POST("", openWorkspace)
		}

		// Charts
		charts := v1.Group("/charts")
		{
			charts.POST("", createChart)
			charts.GET("", listCharts)
			charts.DELETE("/:id", deleteChart)
			charts.PATCH("", updateChart)
		}

		// Key Events
		keyEvents := v1.Group("/key-events")
		{
			keyEvents.GET("/year/:year", listKeyEventsByYear)
			keyEvents.GET("/dates/:year", listKeyEventDates)
			keyEvents.GET("/:date", getKeyEvent)
			keyEvents.POST("", upsertKeyEvent)
			keyEvents.DELETE("/:date", deleteKeyEvent)
			keyEvents.GET("/:date/images", listKeyEventImages)
			keyEvents.POST("/:date/images", addKeyEventImage)
		}

		keyEventImages := v1.Group("/key-event-images")
		{
			keyEventImages.DELETE("/:id", deleteKeyEventImage)
		}
	}
}

func JsonArg(c *gin.Context, result *models.Result) (arg map[string]any, ok bool) {
	arg = make(map[string]any)
	if err := c.BindJSON(&arg); nil != err {
		result.Code = -1
		result.Msg = fmt.Sprintf("parses request failed: %v", err)
		return
	}

	ok = true
	return
}
