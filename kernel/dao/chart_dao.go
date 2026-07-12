package dao

import (
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

type ChartDao interface {
	Create(ws *workspace.Workspace, chart *models.Chart) error
	DeleteById(ws *workspace.Workspace, chartId string) error
	GetMaxSort(ws *workspace.Workspace, ledgerID string) (int, error)
	QueryById(ws *workspace.Workspace, chartId string) (*models.Chart, error)
	QueryByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*models.Chart, error)
	CountByLedgerId(ws *workspace.Workspace, ledgerID string) (int64, error)
	Save(ws *workspace.Workspace, chart *models.Chart) error
}

var _ ChartDao = &chartDaoImpl{}

type chartDaoImpl struct{}

func NewChartDao() ChartDao {
	return &chartDaoImpl{}
}

func (d *chartDaoImpl) Create(ws *workspace.Workspace, chart *models.Chart) error {
	return ws.GetDb().Create(chart).Error
}

func (d *chartDaoImpl) DeleteById(ws *workspace.Workspace, chartId string) error {
	return ws.GetDb().Where("chart_id = ?", chartId).Delete(&models.Chart{}).Error
}

func (d *chartDaoImpl) GetMaxSort(ws *workspace.Workspace, ledgerID string) (int, error) {
	var maxSortOrder int
	if err := ws.GetDb().Model(&models.Chart{}).
		Where("ledger_id = ?", ledgerID).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error; err != nil {
		return 0, err
	}
	return maxSortOrder, nil
}

func (d *chartDaoImpl) QueryById(ws *workspace.Workspace, chartId string) (*models.Chart, error) {
	var chart models.Chart
	err := ws.GetDb().Where("chart_id = ?", chartId).First(&chart).Error
	return &chart, err
}

func (d *chartDaoImpl) QueryByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*models.Chart, error) {
	charts := make([]*models.Chart, 0)
	if err := ws.GetDb().
		Where("ledger_id = ?", ledgerId).
		Order("is_preset DESC, sort_order ASC, created_at DESC").
		Find(&charts).Error; err != nil {
		return nil, err
	}
	return charts, nil
}

func (d *chartDaoImpl) CountByLedgerId(ws *workspace.Workspace, ledgerID string) (int64, error) {
	var count int64
	err := ws.GetDb().Model(&models.Chart{}).Where("ledger_id = ?", ledgerID).Count(&count).Error
	return count, err
}

func (d *chartDaoImpl) Save(ws *workspace.Workspace, chart *models.Chart) error {
	return ws.GetDb().Save(chart).Error
}
