const API_BASE = '/api'
const DEFAULT_TIMEOUT = 30000 // 30 seconds

// Custom error types for better error handling
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message)
    this.name = 'TimeoutError'
  }
}

async function request<T>(
  endpoint: string,
  options?: RequestInit & { timeout?: number }
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options || {}

  // Create abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions?.headers,
      },
      ...fetchOptions,
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new ApiError(
        `API error: ${response.status} ${response.statusText}`,
        response.status,
        response.statusText
      )
    }

    return response.json()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(`Request to ${endpoint} timed out after ${timeout}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export const api = {
  get: <T>(endpoint: string, timeout?: number) =>
    request<T>(endpoint, { timeout }),
  post: <T>(endpoint: string, body: unknown, timeout?: number) =>
    request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      timeout,
    }),
  delete: <T>(endpoint: string, timeout?: number) =>
    request<T>(endpoint, { method: 'DELETE', timeout }),
}
