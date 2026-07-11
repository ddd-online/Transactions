import NotificationUtil from "@/backend/notification";

/**
 * Pure error recovery — never throws, never notifies.
 * Callers decide whether and how to display the error.
 *
 * Usage:
 *   const data = await tryOrFallback(() => fetchData(), [])
 *   if (!data.length) notify('加载失败')
 */
export async function tryOrFallback<T, F>(
  fn: () => Promise<T>,
  fallback: F
): Promise<T | F> {
  try {
    return await fn();
  } catch {
    return fallback as F;
  }
}

/**
 * 查询模式：错误时通知并返回 fallback 值，不抛出。
 */
export async function withErrorHandling<T, F>(
  fn: () => Promise<T>,
  opts: { errorPrefix: string; fallback: F }
): Promise<T | F>;

/**
 * 变更模式：错误时通知并重新抛出，由调用方决定后续行为。
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  opts: { errorPrefix: string; rethrow: true }
): Promise<T>;

export async function withErrorHandling<T, F>(
  fn: () => Promise<T>,
  opts: { errorPrefix: string; fallback?: F; rethrow?: boolean }
): Promise<T | F> {
  try {
    return await fn();
  } catch (error) {
    NotificationUtil.error(opts.errorPrefix, `${error}`);
    if (opts.rethrow) {
      throw error;
    }
    return opts.fallback as F;
  }
}
