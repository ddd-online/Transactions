import { getImageBaseUrl } from '@/backend/api/api-client'

export function getImageUrl(filePath: string): string {
    return `${getImageBaseUrl()}/api/v1/static/${filePath}`
}
