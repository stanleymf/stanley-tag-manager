import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Users, Settings, BarChart3, Tag } from "lucide-react";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Customer Segments',
      icon: Users
    },
    {
      id: 'rules',
      label: 'Tagging Rules',
      icon: Settings
    },
    {
      id: 'bulk-tagger',
      label: 'Bulk Tagger',
      icon: Tag
    }
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 h-screen flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-8 w-8 text-blue-600" />
          <h1 className="text-xl font-semibold text-gray-900">Customer Tagger</h1>
        </div>
      </div>
      
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant={activeTab === item.id ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3 h-11",
                  activeTab === item.id 
                    ? "bg-blue-600 text-white hover:bg-blue-700" 
                    : "text-gray-700 hover:bg-gray-100"
                )}
                onClick={() => onTabChange(item.id)}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}