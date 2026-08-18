/**
 * Validation utilities for user input and data
 */

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidQueryLength(query: string, minLength: number = 20, maxLength: number = 8000): boolean {
  return query.length >= minLength && query.length <= maxLength;
}

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

export function validateProjectSpec(spec: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!spec.description || typeof spec.description !== 'string') {
    errors.push('Description is required and must be a string');
  }

  if (!Array.isArray(spec.requirements) || spec.requirements.length === 0) {
    errors.push('At least one requirement is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateDataset(dataset: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!dataset.id || typeof dataset.id !== 'string') {
    errors.push('Dataset ID is required');
  }

  if (!dataset.name || typeof dataset.name !== 'string') {
    errors.push('Dataset name is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
