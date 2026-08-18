/**
 * API client utilities for making requests to backend endpoints
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface SearchParams {
  query: string;
  type?: 'dataset' | 'model' | 'both';
  limit?: number;
  offset?: number;
}

export interface ProjectSpec {
  description: string;
  requirements: string[];
  constraints?: string[];
  targetAudience?: string;
}

/**
 * Make authenticated API request
 */
export async function makeApiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`/api${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Search datasets and models
 */
export async function searchResources(params: SearchParams) {
  return makeApiRequest('/search', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Get project diagnostics
 */
export async function getDiagnostics(projectSpec: ProjectSpec) {
  return makeApiRequest('/diagnostics/gemini', {
    method: 'POST',
    body: JSON.stringify(projectSpec),
  });
}

/**
 * Send chat message
 */
export async function sendChatMessage(message: string, context?: Record<string, unknown>) {
  return makeApiRequest('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, context }),
  });
}
