import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CodeNodeProps {
  data: {
    name: string;
    type: string;
    file: string;
    metadata?: {
      is_entry?: boolean;
      endpoint?: string;
      method?: string;
    };
  };
  selected?: boolean;
}

const getNodeStyle = (type: string) => {
  const styles = {
    component: 'border-l-4 border-l-[hsl(var(--code-component))] bg-gradient-to-r from-[hsl(var(--code-component)/0.1)] to-transparent',
    class: 'border-l-4 border-l-[hsl(var(--code-class))] bg-gradient-to-r from-[hsl(var(--code-class)/0.1)] to-transparent',
    function: 'border-l-4 border-l-[hsl(var(--code-function))] bg-gradient-to-r from-[hsl(var(--code-function)/0.1)] to-transparent',
    api_endpoint: 'border-l-4 border-l-[hsl(var(--code-api))] bg-gradient-to-r from-[hsl(var(--code-api)/0.1)] to-transparent',
    module: 'border-l-4 border-l-[hsl(var(--code-module))] bg-gradient-to-r from-[hsl(var(--code-module)/0.1)] to-transparent',
    controller: 'border-l-4 border-l-[hsl(var(--code-controller))] bg-gradient-to-r from-[hsl(var(--code-controller)/0.1)] to-transparent',
    service: 'border-l-4 border-l-[hsl(var(--code-service))] bg-gradient-to-r from-[hsl(var(--code-service)/0.1)] to-transparent',
    view: 'border-l-4 border-l-[hsl(var(--code-view))] bg-gradient-to-r from-[hsl(var(--code-view)/0.1)] to-transparent'
  };
  return styles[type as keyof typeof styles] || styles.function;
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
  const { name, type, file, metadata } = data;
  const isEntry = metadata?.is_entry;

  return (
    <div className={cn(
      'min-w-[200px] max-w-[280px] p-3 rounded-lg border bg-card text-card-foreground shadow-lg',
      'transition-all duration-300 hover:shadow-xl',
      getNodeStyle(type),
      selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
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
                variant="outline" 
                className="text-xs border-accent text-accent"
              >
                entry
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

      {/* Entry point glow */}
      {isEntry && (
        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/20 to-transparent pointer-events-none" />
      )}
    </div>
  );
};

export default memo(CodeNode);