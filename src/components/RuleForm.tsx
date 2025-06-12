import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, X } from "lucide-react";
import { apiService, type TaggingRule, type CustomerSegment } from "@/lib/api";

interface RuleFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rule: Omit<TaggingRule, 'id' | 'createdAt'>) => void;
  editingRule?: TaggingRule | null;
}

interface Action {
  id: string;
  type: 'add' | 'remove';
  tag: string;
}

export function RuleForm({ isOpen, onClose, onSave, editingRule }: RuleFormProps) {
  const [name, setName] = useState(editingRule?.name || '');
  const [triggerSegment, setTriggerSegment] = useState(editingRule?.triggerSegment || '');
  const [actions, setActions] = useState<Action[]>(
    editingRule?.actions.map((action, index) => ({ ...action, id: `action-${index}` })) || 
    [{ id: 'action-0', type: 'add', tag: '' }]
  );
  const [segments, setSegments] = useState<CustomerSegment[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadSegments();
    }
  }, [isOpen]);

  const loadSegments = async () => {
    try {
      const data = await apiService.getSegments();
      setSegments(data);
    } catch (error) {
      console.error('Error loading segments:', error);
    }
  };

  const handleAddAction = () => {
    const newId = `action-${Date.now()}`;
    setActions([...actions, { id: newId, type: 'add', tag: '' }]);
  };

  const handleRemoveAction = (id: string) => {
    setActions(actions.filter(action => action.id !== id));
  };

  const handleActionChange = (id: string, field: keyof Omit<Action, 'id'>, value: string) => {
    const newActions = actions.map(action => 
      action.id === id ? { ...action, [field]: value } : action
    );
    setActions(newActions);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !triggerSegment || actions.some(action => !action.tag.trim())) {
      return;
    }

    onSave({
      name: name.trim(),
      triggerSegment,
      actions: actions.filter(action => action.tag.trim()).map(({ id, ...action }) => action),
      isActive: editingRule?.isActive ?? true
    });

    // Reset form
    setName('');
    setTriggerSegment('');
    setActions([{ id: 'action-0', type: 'add', tag: '' }]);
    onClose();
  };

  const handleClose = () => {
    setName(editingRule?.name || '');
    setTriggerSegment(editingRule?.triggerSegment || '');
    setActions(
      editingRule?.actions.map((action, index) => ({ ...action, id: `action-${index}` })) || 
      [{ id: 'action-0', type: 'add', tag: '' }]
    );
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-gray-900">
            {editingRule ? 'Edit Tagging Rule' : 'Create New Tagging Rule'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="rule-name" className="text-sm font-medium text-gray-700">
              Rule Name
            </Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a descriptive name for this rule"
              className="w-full"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Trigger Condition</Label>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>WHEN a customer is a member of</span>
              <Select value={triggerSegment} onValueChange={setTriggerSegment} required>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select segment" />
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
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-gray-700">Actions</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddAction}
                className="text-blue-600 border-blue-600 hover:bg-blue-50"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Action
              </Button>
            </div>

            <div className="space-y-3">
              {actions.map((action) => (
                <Card key={action.id} className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 min-w-fit">THEN</span>
                      
                      <Select
                        value={action.type}
                        onValueChange={(value: 'add' | 'remove') => 
                          handleActionChange(action.id, 'type', value)
                        }
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="add">Add</SelectItem>
                          <SelectItem value="remove">Remove</SelectItem>
                        </SelectContent>
                      </Select>

                      <span className="text-sm text-gray-600">tag</span>

                      <Input
                        value={action.tag}
                        onChange={(e) => handleActionChange(action.id, 'tag', e.target.value)}
                        placeholder="Tag name"
                        className="flex-1"
                        required
                      />

                      {actions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveAction(action.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}