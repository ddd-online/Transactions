/** 消费模板 DTO（既有 `TransactionTemplateDto`；tags 在库里是 JSON 字符串）。 */
export interface TransactionTemplateDto {
  templateId: string
  ledgerId: string
  templateName: string
  transactionType: string
  category: string
  tags: string[]
  flags: string
  description: string
  sortOrder: number
}
