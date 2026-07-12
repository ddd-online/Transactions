package binding

import (
	"github.com/gin-gonic/gin"

	"github.com/billadm/models/dto"
)

func JsonTransactionRecordDto(c *gin.Context) (*dto.TransactionRecordDto, bool) {
	ret := &dto.TransactionRecordDto{}
	if err := c.BindJSON(ret); nil != err {
		return nil, false
	}
	return ret, true
}

func JsonTransactionRecordDtoBatch(c *gin.Context) ([]*dto.TransactionRecordDto, bool) {
	var ret []*dto.TransactionRecordDto
	if err := c.BindJSON(&ret); nil != err {
		return nil, false
	}
	return ret, true
}

func JsonQueryCondition(c *gin.Context) (*dto.TrQueryCondition, bool) {
	ret := &dto.TrQueryCondition{
		Offset:  -1,
		Limit:   -1,
		TsRange: make([]int64, 0),
		Items:   make([]dto.QueryConditionItem, 0),
	}
	if err := c.BindJSON(ret); nil != err {
		return nil, false
	}
	return ret, true
}

func JsonCreateChart(c *gin.Context) (*dto.CreateChartRequest, bool) {
	ret := &dto.CreateChartRequest{}
	if err := c.BindJSON(ret); err != nil {
		return nil, false
	}
	return ret, true
}

func JsonUpdateChart(c *gin.Context) (*dto.UpdateChartRequest, bool) {
	ret := &dto.UpdateChartRequest{}
	if err := c.BindJSON(ret); err != nil {
		return nil, false
	}
	return ret, true
}

func JsonChartQuery(c *gin.Context) (*dto.ChartQueryRequest, bool) {
	ret := &dto.ChartQueryRequest{}
	if err := c.BindJSON(ret); err != nil {
		return nil, false
	}
	return ret, true
}

func JsonTransactionTemplateDto(c *gin.Context) (*dto.TransactionTemplateDto, bool) {
	ret := &dto.TransactionTemplateDto{}
	if err := c.BindJSON(ret); nil != err {
		return nil, false
	}
	return ret, true
}
