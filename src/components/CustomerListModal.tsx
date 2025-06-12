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
import { Loader2, Users, Mail, Calendar, Tag } from "lucide-react";
import { apiService, type ShopifyCustomer, type CustomerSegment } from "@/lib/api";

interface CustomerListModalProps {
  isOpen: boolean;
  onClose: () => void;
  segment: CustomerSegment | null;
}

export function CustomerListModal({ isOpen, onClose, segment }: CustomerListModalProps) {
  const [customers, setCustomers] = useState<ShopifyCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && segment) {
      loadCustomers();
    }
  }, [isOpen, segment]);

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

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const getCustomerTags = (customer: ShopifyCustomer) => {
    if (!customer.tags) return [];
    return customer.tags.split(',').map(tag => tag.trim()).filter(Boolean);
  };

  if (!segment) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Users className="h-5 w-5" />
            {segment.name}
            <Badge variant="secondary" className="ml-2">
              {segment.customerCount} customers
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-2 text-lg text-gray-600">Loading customers...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-600 mb-4">{error}</div>
              <Button onClick={loadCustomers} variant="outline">
                Try Again
              </Button>
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No customers found</h3>
              <p className="text-gray-600">This segment doesn't contain any customers yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Showing {customers.length} customers from {segment.name}
                </p>
                <Button onClick={loadCustomers} variant="outline" size="sm">
                  Refresh
                </Button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-medium text-gray-700">Customer</TableHead>
                      <TableHead className="font-medium text-gray-700">Email</TableHead>
                      <TableHead className="font-medium text-gray-700">Created</TableHead>
                      <TableHead className="font-medium text-gray-700">Tags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer) => (
                      <TableRow key={customer.id} className="hover:bg-gray-50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <Users className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">
                                {customer.first_name || customer.last_name 
                                  ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
                                  : 'Anonymous Customer'
                                }
                              </div>
                              <div className="text-xs text-gray-500">ID: {customer.id}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-700">{customer.email || 'No email'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-600">{formatDate(customer.created_at)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {getCustomerTags(customer).length === 0 ? (
                              <span className="text-gray-400 text-sm">No tags</span>
                            ) : (
                              getCustomerTags(customer).map((tag) => (
                                <Badge 
                                  key={tag} 
                                  variant="secondary" 
                                  className="text-xs flex items-center gap-1"
                                >
                                  <Tag className="h-3 w-3" />
                                  {tag}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <div className="border-t pt-4 flex justify-end">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 