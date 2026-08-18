/**
 * UI-related type definitions
 */

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}

export interface CardProps {
  title?: string;
  description?: string;
  children?: React.ReactNode;
  hoverable?: boolean;
  clickable?: boolean;
  onClick?: () => void;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
}

export interface NotificationProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
  onClose?: () => void;
}

export interface SearchResultItem {
  id: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  score?: number;
}

export interface FilterOption {
  label: string;
  value: string | number | boolean;
  count?: number;
}
