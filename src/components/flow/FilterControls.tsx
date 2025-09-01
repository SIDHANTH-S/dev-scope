import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Search, Filter, Eye, EyeOff } from 'lucide-react';

interface FilterControlsProps {
  edgeTypes: string[];
  nodeTypes: string[];
  visibleEdgeTypes: Set<string>;
  visibleNodeTypes: Set<string>;
  searchTerm: string;
  onEdgeTypeToggle: (type: string) => void;
  onNodeTypeToggle: (type: string) => void;
  onSearchChange: (term: string) => void;
  onShowAllEdges: () => void;
  onHideAllEdges: () => void;
}

const FilterControls = ({
  edgeTypes,
  nodeTypes,
  visibleEdgeTypes,
  visibleNodeTypes,
  searchTerm,
  onEdgeTypeToggle,
  onNodeTypeToggle,
  onSearchChange,
  onShowAllEdges,
  onHideAllEdges
}: FilterControlsProps) => {
  return (
    <Card className="absolute top-20 left-4 z-10 w-80 bg-background/95 backdrop-blur-sm border shadow-lg">
      <CardContent className="p-4 space-y-4">
        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search" className="text-sm font-medium">Search Nodes</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Search by name or file..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Edge Type Filters */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Edge Types</Label>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onShowAllEdges}
                className="h-6 px-2 text-xs"
              >
                <Eye className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onHideAllEdges}
                className="h-6 px-2 text-xs"
              >
                <EyeOff className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {edgeTypes.map((type) => (
              <div key={type} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-0.5 rounded ${
                    type === 'imports' ? 'bg-[hsl(var(--code-module))]' :
                    type === 'renders' ? 'bg-[hsl(var(--code-component))]' :
                    type === 'calls' ? 'bg-[hsl(var(--code-function))]' :
                    type === 'inherits' ? 'bg-[hsl(var(--code-class))]' :
                    type === 'routes_to' ? 'bg-[hsl(var(--primary))]' :
                    type === 'calls_api' ? 'bg-[hsl(var(--code-api))]' :
                    'bg-[hsl(var(--muted-foreground))]'
                  }`} />
                  <span className="text-xs">{type}</span>
                </div>
                <Switch
                  checked={visibleEdgeTypes.has(type)}
                  onCheckedChange={() => onEdgeTypeToggle(type)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Node Type Filters */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Node Types</Label>
          <div className="flex flex-wrap gap-1">
            {nodeTypes.map((type) => (
              <Badge
                key={type}
                variant={visibleNodeTypes.has(type) ? "default" : "outline"}
                className={`cursor-pointer text-xs ${
                  visibleNodeTypes.has(type) ? '' : 'opacity-50'
                }`}
                onClick={() => onNodeTypeToggle(type)}
              >
                {type}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FilterControls;