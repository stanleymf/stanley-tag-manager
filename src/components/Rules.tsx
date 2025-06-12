import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Edit, Trash2, Settings, Play } from "lucide-react";
import { mockRules, type TaggingRule } from "@/data/mockData";
import { apiService } from "@/lib/api";
import { RuleForm } from "./RuleForm";

export function Rules() {
  const [rules, setRules] = useState<TaggingRule[]>(mockRules);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TaggingRule | null>(null);

  const handleCreateRule = () => {
    setEditingRule(null);
    setIsFormOpen(true);
  };

  const handleEditRule = (rule: TaggingRule) => {
    setEditingRule(rule);
    setIsFormOpen(true);
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules(rules.filter(rule => rule.id !== ruleId));
  };

  const handleToggleRule = (ruleId: string) => {
    setRules(rules.map(rule => 
      rule.id === ruleId ? { ...rule, isActive: !rule.isActive } : rule
    ));
  };

  const handleSaveRule = (ruleData: Omit<TaggingRule, 'id' | 'createdAt'>) => {
    if (editingRule) {
      // Update existing rule
      setRules(rules.map(rule => 
        rule.id === editingRule.id 
          ? { ...rule, ...ruleData }
          : rule
      ));
    } else {
      // Create new rule
      const newRule: TaggingRule = {
        ...ruleData,
        id: `rule-${Date.now()}`,
        createdAt: new Date().toISOString()
      };
      setRules([...rules, newRule]);
    }
    setIsFormOpen(false);
  };

  const handleExecuteRule = async (rule: TaggingRule) => {
    if (!rule.isActive) {
      alert('Please activate the rule before executing it.');
      return;
    }

    try {
      const result = await apiService.executeRule(rule);
      alert(`Rule executed successfully!\n${result.customersProcessed} customers processed\n${result.success} successful updates\n${result.failed} failed updates`);
    } catch (error) {
      alert('Failed to execute rule: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatActions = (actions: TaggingRule['actions']) => {
    return actions.map(action => 
      `${action.type === 'add' ? '+' : '-'}${action.tag}`
    ).join(', ');
  };

  const activeRulesCount = rules.filter(rule => rule.isActive).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tagging Rules</h1>
          <p className="text-gray-600 mt-1">Automate customer tagging based on segment membership</p>
        </div>
        <Button 
          onClick={handleCreateRule}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Rule
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Rules</CardTitle>
            <Settings className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{rules.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Rules</CardTitle>
            <Settings className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeRulesCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Inactive Rules</CardTitle>
            <Settings className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-500">{rules.length - activeRulesCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium text-gray-900">Rules Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-center py-12">
              <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No rules created yet</h3>
              <p className="text-gray-600 mb-4">Create your first tagging rule to automate customer management</p>
              <Button onClick={handleCreateRule} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Rule
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-medium text-gray-700">Rule Name</TableHead>
                  <TableHead className="font-medium text-gray-700">Trigger Segment</TableHead>
                  <TableHead className="font-medium text-gray-700">Actions</TableHead>
                  <TableHead className="font-medium text-gray-700">Status</TableHead>
                  <TableHead className="font-medium text-gray-700">Created</TableHead>
                  <TableHead className="font-medium text-gray-700 w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium text-gray-900">{rule.name}</TableCell>
                    <TableCell className="text-gray-700">{rule.triggerSegment}</TableCell>
                    <TableCell className="text-gray-600 font-mono text-sm">
                      {formatActions(rule.actions)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={() => handleToggleRule(rule.id)}
                        />
                        <Badge 
                          variant="secondary" 
                          className={rule.isActive 
                            ? "bg-green-100 text-green-800 hover:bg-green-100" 
                            : "bg-gray-100 text-gray-600 hover:bg-gray-100"
                          }
                        >
                          {rule.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600">{formatDate(rule.createdAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => handleExecuteRule(rule)}
                            disabled={!rule.isActive}
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Execute Rule
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditRule(rule)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteRule(rule.id)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RuleForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSaveRule}
        editingRule={editingRule}
      />
    </div>
  );
}