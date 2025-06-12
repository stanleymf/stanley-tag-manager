import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { RefreshCw, Users, AlertCircle, Eye } from "lucide-react";
import { apiService, type CustomerSegment } from "@/lib/api";
import { CustomerListModal } from "./CustomerListModal";

export function Dashboard() {
  const [segments, setSegments] = useState<CustomerSegment[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<CustomerSegment | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadSegments = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setIsRefreshing(true);
      setError(null);
      
      const data = await apiService.getSegments();
      setSegments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load segments');
      console.error('Error loading segments:', err);
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSegments();
  }, []);

  const handleRefresh = async () => {
    await loadSegments(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const handleViewCustomers = (segment: CustomerSegment) => {
    setSelectedSegment(segment);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedSegment(null);
  };

  const totalCustomers = segments.reduce((sum, segment) => sum + segment.customerCount, 0);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-lg text-gray-600">Loading segments...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Customer Segments</h1>
          <p className="text-gray-600 mt-1">Manage your Shopify customer segments and their tags</p>
        </div>
        <Button 
          onClick={handleRefresh} 
          disabled={isRefreshing}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Sync Segments
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}. Make sure your Shopify credentials are configured correctly.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Segments</CardTitle>
            <Users className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{segments.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{totalCustomers.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Last Sync</CardTitle>
            <RefreshCw className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {segments.length > 0 ? 'Just now' : 'Never'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium text-gray-900">Segments Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {segments.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No segments found</h3>
              <p className="text-gray-600 mb-4">
                {error 
                  ? 'Unable to connect to Shopify. Check your configuration.'
                  : 'No customer segments available. Try refreshing or check your Shopify store.'
                }
              </p>
              <Button onClick={handleRefresh} className="bg-blue-600 hover:bg-blue-700">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-medium text-gray-700">Segment Name</TableHead>
                  <TableHead className="font-medium text-gray-700">Criteria</TableHead>
                  <TableHead className="font-medium text-gray-700">Customer Count</TableHead>
                  <TableHead className="font-medium text-gray-700">Last Sync</TableHead>
                  <TableHead className="font-medium text-gray-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {segments.map((segment) => (
                  <TableRow key={segment.id} className="hover:bg-gray-50">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{segment.name}</span>
                        {segment.description && (
                          <span className="text-xs text-gray-500 mt-1">{segment.description}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs">
                        {segment.criteria ? (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            {segment.criteria.length > 50 
                              ? `${segment.criteria.substring(0, 50)}...` 
                              : segment.criteria
                            }
                          </Badge>
                        ) : (
                          <span className="text-gray-400 text-sm">No criteria</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-700 font-medium">{segment.customerCount.toLocaleString()}</TableCell>
                    <TableCell className="text-gray-600">{formatDate(segment.lastSync)}</TableCell>
                    <TableCell>
                      <Button
                        onClick={() => handleViewCustomers(segment)}
                        variant="outline"
                        size="sm"
                        className="text-blue-600 border-blue-600 hover:bg-blue-50"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Customers
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CustomerListModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        segment={selectedSegment}
      />
    </div>
  );
}