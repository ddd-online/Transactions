import type { Category, Tag } from '../domain/models'

export interface CategoryDto extends Category {
  recordCount: number
}

export interface TagDto extends Tag {
  recordCount: number
}

export interface InitializeCategoriesResponse {
  categories: number
  tags: number
}
