import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Mail, Calendar, Tag, RefreshCw, Download, AlertCircle } from "lucide-react";
import { apiService, type ShopifyCustomer, type CustomerSegment } from "@/lib/api";

interface CustomerListModalProps {
  isOpen: boolean;
  onClose: () => void;
  segment: CustomerSegment | null;
}

export function CustomerListModal({ isOpen, onClose, segment }: CustomerListModalProps) {
  const [customers, setCustomers] = useState<ShopifyCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingCount, setIsLoadingCount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actualCustomerCount, setActualCustomerCount] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    expectedCount?: number;
    actualCount?: number;
    message?: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen && segment) {
      // Reset state when modal opens
      setCustomers([]);
      setError(null);
      setSyncStatus(null);
      setActualCustomerCount(null);
      
      // If segment needs customer count, fetch it first
      if (segment.needsCustomerCount) {
        fetchCustomerCount();
      } else {
        setActualCustomerCount(segment.customerCount);
        loadCustomers();
      }
    }
  }, [isOpen, segment]);

  const fetchCustomerCount = async () => {
    if (!segment) return;
    
    setIsLoadingCount(true);
    setError(null);
    
    try {
      const result = await apiService.getSegmentCustomerCount(segment.name);
      if (result.success) {
        setActualCustomerCount(result.customerCount);
        // Then load a preview of customers (first 250)
        loadCustomers();
      } else {
        setError('Failed to get customer count');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get customer count');
      console.error('Error fetching customer count:', err);
    } finally {
      setIsLoadingCount(false);
    }
  };

  const loadCustomers = async () => {
    if (!segment) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiService.getCustomersBySegment(segment.name);
      setCustomers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers');
      console.error('Error loading customers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncAllCustomers = async () => {
    if (!segment) return;
    
    setIsSyncing(true);
    setError(null);
    setSyncStatus(null);
    
    try {
      const expectedCount = actualCustomerCount || segment.customerCount;
      console.log(`Starting full sync for segment: ${segment.name} (${expectedCount} expected customers)`);
      
      const result = await apiService.syncCustomersInSegment(segment.name);
      
      if (result.success) {
        setCustomers(result.customers);
        setSyncStatus({
          expectedCount: expectedCount,
          actualCount: result.actualCount,
          message: result.message
        });
        console.log(`Sync completed: ${result.actualCount} customers retrieved`);
      } else {
        setError('Failed to sync customers');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync customers');
      console.error('Error syncing customers:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const getCustomerTags = (customer: ShopifyCustomer) => {
    if (!customer.tags) return [];
    return customer.tags.split(',').map(tag => tag.trim()).filter(Boolean);
  };

  const exportCustomers = () => {
    if (customers.length === 0) return;
    
    const csvContent = [
      ['ID', 'Name', 'Email', 'Orders', 'Total Spent', 'Tags', 'Created'].join(','),
      ...customers.map(customer => [
        customer.id,
        `"${(customer.first_name || '') + ' ' + (customer.last_name || '')}".trim()`,
        customer.email || '',
        customer.orders_count,
        customer.total_spent,
        `"${customer.tags || ''}"`,
        formatDate(customer.created_at)
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${segment?.name || 'customers'}-export.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!segment) return null;

  const displayCustomerCount = actualCustomerCount ?? segment.customerCount;
  const showSyncButton = displayCustomerCount > 250 || customers.length < displayCustomerCount;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {segment.name} Customers
              </DialogTitle>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                {isLoadingCount ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading count...
                  </span>
                ) : (
                  <>
                    <span>Total: {displayCustomerCount.toLocaleString()} customers</span>
                    <span>Loaded: {customers.length.toLocaleString()} customers</span>
                    {syncStatus && (
                      <span className="text-green-600">
                        Last sync: {syncStatus.actualCount?.toLocaleString()} retrieved
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={exportCustomers}
                disabled={customers.length === 0}
                variant="outline"
                size="sm"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              {showSyncButton && (
                <Button
                  onClick={handleSyncAllCustomers}
                  disabled={isSyncing || isLoadingCount}
                  variant="outline"
                  size="sm"
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {isSyncing ? 'Syncing All...' : 'Sync All Customers'}
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {syncStatus && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3 mb-4">
            <div className="text-green-700">
              <div className="font-medium">{syncStatus.message}</div>
              {syncStatus.expectedCount && syncStatus.actualCount && (
                <div className="text-sm mt-1">
                  Retrieved {syncStatus.actualCount.toLocaleString()} of {syncStatus.expectedCount.toLocaleString()} expected customers
                  {syncStatus.actualCount < syncStatus.expectedCount && (
                    <span className="text-amber-600 ml-2">
                      (Some customers may not be accessible via this segment)
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {customers.length < displayCustomerCount && !isSyncing && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-blue-600" />
              <div>
                <div className="font-medium text-blue-800">
                  Showing preview ({customers.length} of {displayCustomerCount.toLocaleString()} customers)
                </div>
                <div className="text-sm text-blue-600 mt-1">
                  Click "Sync All Customers" to fetch all customers with rate-limited pagination.
                </div>
              </div>
            </div>
          </div>
        )}

        {isSyncing && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <div>
                <div className="font-medium text-blue-800">
                  Syncing all customers with pagination...
                </div>
                <div className="text-sm text-blue-600 mt-1">
                  This may take several minutes for large segments. We're fetching all customers while respecting Shopify's rate limits.
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {(isLoading || isLoadingCount) ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-2">
                {isLoadingCount ? 'Getting customer count...' : 'Loading customers...'}
              </span>
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No customers found</h3>
              <p className="text-gray-500 mb-4">
                {displayCustomerCount > 0 
                  ? "Click 'Sync All Customers' to fetch all customers with pagination"
                  : "This segment appears to be empty"
                }
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Total Spent</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {customer.first_name} {customer.last_name}
                        </div>
                        <div className="text-sm text-gray-500">ID: {customer.id}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span className="truncate max-w-[200px]" title={customer.email}>
                          {customer.email || 'No email'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {customer.orders_count} orders
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        ${parseFloat(customer.total_spent || '0').toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {getCustomerTags(customer).slice(0, 3).map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            <Tag className="h-3 w-3 mr-1" />
                            {tag}
                          </Badge>
                        ))}
                        {getCustomerTags(customer).length > 3 && (
                          <span className="text-xs text-gray-500">
                            +{getCustomerTags(customer).length - 3} more
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Calendar className="h-4 w-4" />
                        {formatDate(customer.created_at)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 