package workspace

import (
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"

	"github.com/billadm/models"
)

var defaultData = map[string]map[string][]string{
	"expense": {
		"餐饮美食": {"三餐", "零食", "商场", "外卖", "饮料", "奶茶", "咖啡", "水果", "茶叶", "买菜"},
		"购物消费": {"衣物", "数码", "家居", "书籍", "礼物", "玩具", "宠物", "游戏", "快递", "彩票", "电影", "运动", "酒店", "烟酒", "充值", "汽车", "还款"},
		"交通出行": {"打车", "地铁", "公交", "高铁", "油费", "停车", "ETC", "车险"},
		"生活缴费": {"房租", "物业", "燃气", "水费", "电费", "通讯", "还款", "网费", "理发"},
		"贷款还款": {},
		"医疗健康": {"医药", "医险"},
		"娱乐休闲": {},
		"人情往来": {"红包", "请客", "礼金"},
		"教育学习": {},
	},
	"income": {
		"工资奖金": {"工资", "奖金"},
		"补贴补助": {},
		"退税退款": {},
		"二手转卖": {},
		"彩票收入": {},
		"投资理财": {},
		"借贷借款": {},
		"红包转账": {},
	},
	"transfer": {
		"五险一金": {"养老", "医疗", "失业", "住房"},
		"税费党费": {"团费", "交税"},
	},
}

// GetDefaultData returns the preset categories and tags map.
func GetDefaultData() map[string]map[string][]string {
	return defaultData
}

// SeedData seeds default categories and tags for the given ledger.
// Returns (categoryCount, tagCount, error).
func SeedData(db *gorm.DB, ledgerID string) (int, int, error) {

	categoryCount := 0
	tagCount := 0

	for transactionType, categories := range defaultData {
		for categoryName, tags := range categories {
			category := models.Category{
				LedgerID:        ledgerID,
				Name:            categoryName,
				TransactionType: transactionType,
			}
			if err := db.Create(&category).Error; err != nil {
				logrus.Errorf("创建分类失败: %v", err)
				return 0, 0, err
			}
			categoryCount++

			categoryTransactionType := categoryName + ":" + transactionType
			for _, tagName := range tags {
				tag := models.Tag{
					LedgerID:                ledgerID,
					Name:                    tagName,
					CategoryTransactionType: categoryTransactionType,
				}
				if err := db.Create(&tag).Error; err != nil {
					logrus.Errorf("创建标签失败: %v", err)
					return 0, 0, err
				}
				tagCount++
			}
		}
	}
	return categoryCount, tagCount, nil
}
