package service

import (
	"strings"
	"testing"
)

func TestParseTencentQuotePayload(t *testing.T) {
	line := func(code string, latest string, prev string, ts string) string {
		parts := make([]string, 32)
		for i := range parts {
			parts[i] = "-"
		}
		parts[1] = "测试股票"
		parts[2] = code
		parts[3] = latest
		parts[4] = prev
		parts[30] = ts
		return `v_sh` + code + `="` + strings.Join(parts, "~") + `";`
	}

	payload := []byte(
		line("600000", "10.20", "10.05", "20260904150000") + "\n" +
			// 停牌：最新价 0 → 跳过
			line("000001", "0.00", "12.30", "20260904150000") + "\n" +
			// 畸形价格 → 跳过
			line("600519", "bad", "1500.00", "20260904150000") + "\n",
	)

	quotes := parseTencentQuotePayload(payload)
	if len(quotes) != 1 {
		t.Fatalf("应只解析 1 只股票, 实际 %d: %+v", len(quotes), quotes)
	}
	quote, ok := quotes["600000"]
	if !ok {
		t.Fatalf("缺少 600000 行情: %+v", quotes)
	}
	if quote.LatestPrice != 1020 || quote.PrevClose != 1005 {
		t.Fatalf("价格换算错误: latest=%d prev=%d", quote.LatestPrice, quote.PrevClose)
	}
	if quote.QuoteTime <= 0 {
		t.Fatalf("行情时间缺失: %+v", quote)
	}
}
