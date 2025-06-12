// API configuration
const API_BASE_URL = '/api'; // Worker will handle routing

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface ShopifyCustomer {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  tags: string;
  created_at?: string;
}

export interface CustomerSegment {
  id: string;
  name: string;
  customerCount: number;
  lastSync: string;
  criteria?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaggingRule {
  id: string;
  name: string;
  isActive: boolean;
  triggerSegment: string;
  actions: {
    type: 'add' | 'remove';
    tag: string;
  }[];
  createdAt: string;
}

export interface BulkTagResult {
  success: number;
  failed: number;
  errors: string[];
}

export interface RuleExecutionResult extends BulkTagResult {
  rule: string;
  customersProcessed: number;
}

class ApiService {
  private getAuthHeaders(): Record<string, string> {
    const credentials = localStorage.getItem('auth_credentials');
    if (credentials) {
      return {
        'Authorization': `Basic ${credentials}`,
      };
    }
    return {};
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
          ...options?.headers,
        },
      });

      if (response.status === 401) {
        // Clear invalid credentials and redirect to login
        localStorage.removeItem('auth_credentials');
        window.location.reload();
        throw new Error('Authentication required');
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Customer Segments
  async getSegments(): Promise<CustomerSegment[]> {
    return this.request<CustomerSegment[]>('/segments');
  }

  // Get customers by segment
  async getCustomersBySegment(segmentName: string): Promise<ShopifyCustomer[]> {
    return this.request<ShopifyCustomer[]>(`/customers?segment=${encodeURIComponent(segmentName)}`);
  }

  // Bulk tagging operations
  async applyBulkTags(
    customerIds: string[],
    actions: { type: 'add' | 'remove'; tag: string }[]
  ): Promise<BulkTagResult> {
    return this.request<BulkTagResult>('/bulk-tag', {
      method: 'POST',
      body: JSON.stringify({ customerIds, actions }),
    });
  }

  // Execute a tagging rule
  async executeRule(rule: TaggingRule): Promise<RuleExecutionResult> {
    return this.request<RuleExecutionResult>('/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    });
  }

  // Sync all segments (refresh data)
  async syncSegments(): Promise<CustomerSegment[]> {
    const result = await this.request<{
      success: boolean;
      message: string;
      segments: CustomerSegment[];
      syncedAt: string;
    }>('/segments/sync', {
      method: 'POST',
    });
    
    if (!result.success) {
      throw new Error(result.message || 'Failed to sync segments');
    }
    
    return result.segments;
  }
}

export const apiService = new ApiService();

// Hook for React components
export function useApi() {
  return apiService;
} 