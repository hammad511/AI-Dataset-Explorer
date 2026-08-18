/**
 * API-related type definitions
 */

export interface ApiErrorResponse {
  error: string;
  message?: string;
  code?: string;
  statusCode?: number;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
  page?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchRequest {
  query: string;
  type?: 'dataset' | 'model' | 'both';
  limit?: number;
  offset?: number;
  filters?: Record<string, unknown>;
}

export interface SearchResponse {
  datasets: Dataset[];
  models: Model[];
  totalResults: number;
  executionTime: number;
}

export interface Dataset {
  id: string;
  name: string;
  description: string;
  source: 'kaggle' | 'huggingface' | 'custom';
  url?: string;
  size?: number;
  rows?: number;
  columns?: number;
  license?: string;
  tags?: string[];
  relevanceScore?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Model {
  id: string;
  name: string;
  description: string;
  source: 'huggingface' | 'custom';
  url?: string;
  modelSize?: string;
  parameters?: number;
  framework?: string;
  license?: string;
  tags?: string[];
  relevanceScore?: number;
  downloads?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectSpec {
  description: string;
  requirements: string[];
  constraints?: string[];
  targetAudience?: string;
  budget?: string;
  timeline?: string;
}

export interface DiagnosticsResponse {
  feasibility: {
    isFeasible: boolean;
    confidence: number;
    reasoning: string;
  };
  recommendations: string[];
  estimatedResources: {
    computeRequirements: string;
    storageRequirements: string;
    estimatedTime: string;
  };
}
