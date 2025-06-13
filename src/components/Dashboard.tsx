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
import { Input } from "@/components/ui/input";
import { RefreshCw, Users, AlertCircle, Eye, Search, Clock, Database, TrendingUp, Loader2 } from "lucide-react";
import { apiService, type CustomerSegment } from "@/lib/api";
import { CustomerListModal } from "./CustomerListModal";

export function Dashboard() {
  const [segments, setSegments] = useState<CustomerSegment[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<CustomerSegment | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCounts, setLoadingCounts] = useState<Set<string>>(new Set());

  const loadSegments = async () => {
    try {
      setError(null);
      const data = await apiService.getSegments();
      setSegments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load segments');
      console.error('Error loading segments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSegments();
  }, []);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      
      // Use the sync API to force refresh from Shopify (metadata only)
      const data = await apiService.syncSegments();
      setSegments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync segments');
      console.error('Error syncing segments:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchCustomerCount = async (segment: CustomerSegment) => {
    if (!segment.needsCustomerCount) return; // Already has count
    
    setLoadingCounts(prev => new Set(prev).add(segment.id));
    
    try {
      const result = await apiService.getSegmentCustomerCount(segment.name);
      if (result.success) {
        // Update the segment with the fetched count
        setSegments(prev => prev.map(s => 
          s.id === segment.id 
            ? { ...s, customerCount: result.customerCount, needsCustomerCount: false }
            : s
        ));
      }
    } catch (err) {
      console.error(`Error fetching count for ${segment.name}:`, err);
    } finally {
      setLoadingCounts(prev => {
        const newSet = new Set(prev);
        newSet.delete(segment.id);
        return newSet;
      });
    }
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

  // Filter segments based on search query
  const filteredSegments = segments.filter(segment =>
    segment.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    segment.criteria?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    segment.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalCustomers = segments.reduce((sum, segment) => sum + segment.customerCount, 0);
  const filteredCustomers = filteredSegments.reduce((sum, segment) => sum + segment.customerCount, 0);
  const segmentsWithCounts = segments.filter(s => !s.needsCustomerCount).length;

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
          <h1 className="text-3xl font-bold text-gray-900">Customer Segments</h1>
          <p className="text-gray-600 mt-1">
            Manage and view your Shopify customer segments
          </p>
        </div>
        <Button 
          onClick={handleRefresh} 
          disabled={isRefreshing}
          className="flex items-center gap-2"
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {isRefreshing ? 'Syncing...' : 'Sync Segments'}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Segments</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{segments.length}</div>
            <p className="text-xs text-muted-foreground">
              {filteredSegments.length} visible
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customer Counts Loaded</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{segmentsWithCounts}</div>
            <p className="text-xs text-muted-foreground">
              of {segments.length} segments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalCustomers > 0 ? totalCustomers.toLocaleString() : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              {segmentsWithCounts > 0 ? 'From loaded counts' : 'Click segments to load counts'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Sync</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold">
              {segments.length > 0 ? formatDate(segments[0].lastSync) : 'Never'}
            </div>
            <p className="text-xs text-muted-foreground">
              Metadata sync only
            </p>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-700">{error}</div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search segments by name, criteria, or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Segments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSegments.map((segment) => (
          <Card key={segment.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg text-gray-900 mb-1">
                    {segment.name}
                  </CardTitle>
                  <p className="text-sm text-gray-500 line-clamp-2">
                    {segment.description || segment.criteria}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Customers:</span>
                  <div className="flex items-center gap-2">
                    {segment.needsCustomerCount ? (
                      <Button
                        onClick={() => fetchCustomerCount(segment)}
                        disabled={loadingCounts.has(segment.id)}
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                      >
                        {loadingCounts.has(segment.id) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          'Load Count'
                        )}
                      </Button>
                    ) : (
                      <Badge variant="secondary" className="font-mono">
                        {segment.customerCount.toLocaleString()}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Last sync: {formatDate(segment.lastSync)}</span>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => handleViewCustomers(segment)}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Customers
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredSegments.length === 0 && segments.length > 0 && (
        <div className="text-center py-12">
          <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No segments found</h3>
          <p className="text-gray-600">Try adjusting your search query.</p>
        </div>
      )}

      <CustomerListModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        segment={selectedSegment}
      />
    </div>
  );
}