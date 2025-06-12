import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { 
  Play, 
  Users, 
  Tag, 
  AlertCircle, 
  CheckCircle,
  Loader2
} from "lucide-react";
import { apiService, type CustomerSegment, type ShopifyCustomer, type BulkTagResult } from "@/lib/api";

export function BulkTagger() {
  const [segments, setSegments] = useState<CustomerSegment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<string>("");
  const [customers, setCustomers] = useState<ShopifyCustomer[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [tagAction, setTagAction] = useState<'add' | 'remove'>('add');
  const [tagName, setTagName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<BulkTagResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSegments();
  }, []);

  const loadSegments = async () => {
    try {
      const data = await apiService.getSegments();
      setSegments(data);
    } catch (err) {
      setError('Failed to load segments');
      console.error('Error loading segments:', err);
    }
  };

  const loadCustomers = async (segmentName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiService.getCustomersBySegment(segmentName);
      setCustomers(data);
      setSelectedCustomers(new Set());
    } catch (err) {
      setError('Failed to load customers');
      console.error('Error loading customers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSegmentChange = (value: string) => {
    setSelectedSegment(value);
    setResult(null);
    if (value) {
      loadCustomers(value);
    } else {
      setCustomers([]);
      setSelectedCustomers(new Set());
    }
  };

  const handleCustomerToggle = (customerId: string) => {
    const newSelected = new Set(selectedCustomers);
    if (newSelected.has(customerId)) {
      newSelected.delete(customerId);
    } else {
      newSelected.add(customerId);
    }
    setSelectedCustomers(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedCustomers.size === customers.length) {
      setSelectedCustomers(new Set());
    } else {
      setSelectedCustomers(new Set(customers.map(c => c.id)));
    }
  };

  const handleBulkTag = async () => {
    if (!tagName.trim() || selectedCustomers.size === 0) {
      setError('Please enter a tag name and select customers');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const customerIds = Array.from(selectedCustomers);
      const actions = [{ type: tagAction, tag: tagName.trim() }];
      
      const bulkResult = await apiService.applyBulkTags(customerIds, actions);
      setResult(bulkResult);
      
      // Refresh customer data to show updated tags
      if (selectedSegment) {
        loadCustomers(selectedSegment);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply tags');
      console.error('Error applying bulk tags:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const getCustomerTags = (customer: ShopifyCustomer) => {
    return customer.tags ? customer.tags.split(',').map(tag => tag.trim()).filter(Boolean) : [];
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Bulk Tag Manager</h1>
        <p className="text-gray-600 mt-1">Apply tags to multiple customers at once</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Bulk tagging completed! {result.success} customers updated successfully.
            {result.failed > 0 && ` ${result.failed} failed.`}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Tag Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Customer Segment</Label>
              <Select value={selectedSegment} onValueChange={handleSegmentChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer segment" />
                </SelectTrigger>
                <SelectContent>
                  {segments.map((segment) => (
                    <SelectItem key={segment.id} value={segment.name}>
                      {segment.name} ({segment.customerCount} customers)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={tagAction} onValueChange={(value: 'add' | 'remove') => setTagAction(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add Tag</SelectItem>
                  <SelectItem value="remove">Remove Tag</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tag Name</Label>
              <Input
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="Enter tag name"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Selected: {selectedCustomers.size} customers</span>
              <span>Total: {customers.length} customers</span>
            </div>

            <Button
              onClick={handleBulkTag}
              disabled={!tagName.trim() || selectedCustomers.size === 0 || isProcessing}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  {tagAction === 'add' ? 'Add' : 'Remove'} Tag
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Customer Selection
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedSegment ? (
              <div className="text-center py-8 text-gray-500">
                Select a customer segment to view customers
              </div>
            ) : isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                <span className="text-gray-600">Loading customers...</span>
              </div>
            ) : customers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No customers found in this segment
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={selectedCustomers.size === customers.length}
                      onCheckedChange={handleSelectAll}
                    />
                    <Label className="text-sm font-medium">Select All</Label>
                  </div>
                  <Badge variant="outline">
                    {selectedCustomers.size} of {customers.length} selected
                  </Badge>
                </div>

                <div className="max-h-96 overflow-y-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Current Tags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.map((customer) => (
                        <TableRow key={customer.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedCustomers.has(customer.id)}
                              onCheckedChange={() => handleCustomerToggle(customer.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {customer.first_name} {customer.last_name}
                              </div>
                              <div className="text-sm text-gray-600">{customer.email}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {getCustomerTags(customer).map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 