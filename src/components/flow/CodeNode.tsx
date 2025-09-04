import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CodeNodeProps {
  data: {
    name: string;
    type: string;
    file: string;
    importance?: number;
    metadata?: {
      is_entry?: boolean;
      endpoint?: string;
      method?: string;
    };
  };
  selected?: boolean;
}

const getNodeStyle = (type: string, importance: number = 1, isEntry: boolean = false) => {
  const baseStyles = {
    component: 'border-l-4 border-l-[hsl(var(--code-component))] bg-gradient-to-r from-[hsl(var(--code-component)/0.1)] to-transparent',
    class: 'border-l-4 border-l-[hsl(var(--code-class))] bg-gradient-to-r from-[hsl(var(--code-class)/0.1)] to-transparent',
    function: 'border-l-4 border-l-[hsl(var(--code-function))] bg-gradient-to-r from-[hsl(var(--code-function)/0.1)] to-transparent',
    api_endpoint: 'border-l-4 border-l-[hsl(var(--code-api))] bg-gradient-to-r from-[hsl(var(--code-api)/0.1)] to-transparent',
    module: 'border-l-4 border-l-[hsl(var(--code-module))] bg-gradient-to-r from-[hsl(var(--code-module)/0.1)] to-transparent',
    controller: 'border-l-4 border-l-[hsl(var(--code-controller))] bg-gradient-to-r from-[hsl(var(--code-controller)/0.1)] to-transparent',
    service: 'border-l-4 border-l-[hsl(var(--code-service))] bg-gradient-to-r from-[hsl(var(--code-service)/0.1)] to-transparent',
    view: 'border-l-4 border-l-[hsl(var(--code-view))] bg-gradient-to-r from-[hsl(var(--code-view)/0.1)] to-transparent'
  };
  
  const baseStyle = baseStyles[type as keyof typeof baseStyles] || baseStyles.function;
  const glowStyle = isEntry ? 'shadow-[0_0_20px_hsl(var(--primary)/0.3)]' : 
                   importance > 5 ? 'shadow-[0_0_10px_hsl(var(--primary)/0.15)]' : '';
  
  return `${baseStyle} ${glowStyle}`;
};

const getNodeIcon = (type: string) => {
  const icons = {
    component: '⚛️',
    class: '🏗️',
    function: '⚡',
    api_endpoint: '🌐',
    module: '📦',
    controller: '🎮',
    service: '⚙️',
    view: '👁️',
    template: '📄'
  };
  return icons[type as keyof typeof icons] || '📄';
};

const CodeNode = ({ data, selected }: CodeNodeProps) => {
  const { name, type, file, metadata, importance = 1 } = data;
  const isEntry = metadata?.is_entry;
  
  // Calculate node size based on importance
  const getNodeSize = () => {
    if (isEntry) return "min-w-[240px] max-w-[320px]";
    if (importance > 7) return "min-w-[220px] max-w-[300px]";
    if (importance > 4) return "min-w-[200px] max-w-[280px]";
    return "min-w-[180px] max-w-[260px]";
  };

  return (
    <div className={cn(
      getNodeSize(),
      'p-3 rounded-lg border bg-card text-card-foreground shadow-lg',
      'transition-all duration-300 hover:shadow-xl relative',
      getNodeStyle(type, importance, isEntry),
      selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      isEntry && 'transform scale-105'
    )}>
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-border hover:!bg-primary transition-colors"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-border hover:!bg-primary transition-colors"
      />

      {/* Node Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{getNodeIcon(type)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge 
              variant="secondary" 
              className="text-xs font-mono"
            >
              {type}
            </Badge>
            {isEntry && (
              <Badge 
                variant="default" 
                className="text-xs bg-primary text-primary-foreground"
              >
                ENTRY
              </Badge>
            )}
            {importance > 7 && !isEntry && (
              <Badge variant="outline" className="text-xs">
                ⭐
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Node Content */}
      <div className="space-y-1">
        <h3 className="font-semibold text-sm truncate" title={name}>
          {name}
        </h3>
        <p className="text-xs text-muted-foreground truncate" title={file}>
          {file}
        </p>
        
        {/* API Endpoint specific */}
        {type === 'api_endpoint' && metadata?.endpoint && (
          <div className="flex items-center gap-1 mt-2">
            <Badge variant="outline" className="text-xs">
              {metadata.method || 'GET'}
            </Badge>
            <code className="text-xs text-accent">{metadata.endpoint}</code>
          </div>
        )}
      </div>

      {/* Importance indicator */}
      {importance > 5 && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full border-2 border-background" />
      )}
    </div>
  );
};

export default memo(CodeNode);