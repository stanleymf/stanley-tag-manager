// API configuration
const API_BASE_URL = '/api'; // Worker will handle routing

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface ShopifyCustomer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  updated_at: string;
  tags: string;
  orders_count: number;
  total_spent: string;
  addresses?: any[];
  display_name?: string;
  note?: string;
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
  needsCustomerCount?: boolean; // Flag to indicate if count needs to be fetched
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

  // Tagging Rules CRUD operations
  async getRules(): Promise<TaggingRule[]> {
    return this.request<TaggingRule[]>('/rules');
  }

  async createRule(rule: Omit<TaggingRule, 'id' | 'createdAt'>): Promise<TaggingRule> {
    return this.request<TaggingRule>('/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    });
  }

  async updateRule(ruleId: string, rule: Omit<TaggingRule, 'id' | 'createdAt'>): Promise<TaggingRule> {
    return this.request<TaggingRule>(`/rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify(rule),
    });
  }

  async deleteRule(ruleId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/rules/${ruleId}`, {
      method: 'DELETE',
    });
  }

  async executeRule(ruleId: string): Promise<RuleExecutionResult> {
    return this.request<RuleExecutionResult>(`/rules/${ruleId}/execute`, {
      method: 'POST',
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

  // Get customer count for a specific segment
  async getSegmentCustomerCount(segmentName: string): Promise<{
    success: boolean;
    segment: string;
    segmentId: string;
    customerCount: number;
    fetchedAt: string;
  }> {
    return this.request<{
      success: boolean;
      segment: string;
      segmentId: string;
      customerCount: number;
      fetchedAt: string;
    }>(`/segments/count?segment=${encodeURIComponent(segmentName)}`);
  }

  // Sync all customers from a specific segment (with full pagination)
  async syncCustomersInSegment(segmentName: string): Promise<{
    success: boolean;
    message: string;
    segment: string;
    segmentId?: string;
    expectedCount?: number;
    actualCount: number;
    customers: ShopifyCustomer[];
    syncedAt: string;
  }> {
    return this.request<{
      success: boolean;
      message: string;
      segment: string;
      segmentId?: string;
      expectedCount?: number;
      actualCount: number;
      customers: ShopifyCustomer[];
      syncedAt: string;
    }>(`/customers/sync?segment=${encodeURIComponent(segmentName)}`);
  }
}

export const apiService = new ApiService();

// Hook for React components
export function useApi() {
  return apiService;
} 