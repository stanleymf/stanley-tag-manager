export interface CustomerSegment {
  id: string;
  name: string;
  customerCount: number;
  lastSync: string;
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

export const mockSegments: CustomerSegment[] = [
  {
    id: '1',
    name: 'VIP Customers',
    customerCount: 127,
    lastSync: '2024-01-15T10:30:00Z'
  },
  {
    id: '2',
    name: 'VVIP Customers',
    customerCount: 43,
    lastSync: '2024-01-15T10:30:00Z'
  },
  {
    id: '3',
    name: 'New Customers',
    customerCount: 89,
    lastSync: '2024-01-15T10:30:00Z'
  },
  {
    id: '4',
    name: 'Repeat Buyers',
    customerCount: 234,
    lastSync: '2024-01-15T10:30:00Z'
  },
  {
    id: '5',
    name: 'High Value Customers',
    customerCount: 67,
    lastSync: '2024-01-15T10:30:00Z'
  },
  {
    id: '6',
    name: 'At Risk Customers',
    customerCount: 156,
    lastSync: '2024-01-15T10:30:00Z'
  }
];

export const mockRules: TaggingRule[] = [
  {
    id: '1',
    name: 'Assign VVIP Status',
    isActive: true,
    triggerSegment: 'VVIP Customers',
    actions: [
      { type: 'add', tag: 'VVIP' },
      { type: 'remove', tag: 'VIP' }
    ],
    createdAt: '2024-01-10T14:20:00Z'
  },
  {
    id: '2',
    name: 'Tag New Customers',
    isActive: true,
    triggerSegment: 'New Customers',
    actions: [
      { type: 'add', tag: 'New Customer' }
    ],
    createdAt: '2024-01-12T09:15:00Z'
  },
  {
    id: '3',
    name: 'Mark At Risk',
    isActive: false,
    triggerSegment: 'At Risk Customers',
    actions: [
      { type: 'add', tag: 'At Risk' },
      { type: 'remove', tag: 'Active' }
    ],
    createdAt: '2024-01-08T16:45:00Z'
  }
];