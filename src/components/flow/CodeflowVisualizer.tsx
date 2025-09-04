import React, { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  ConnectionMode,
  BackgroundVariant
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CodeNode from './CodeNode';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Maximize2, RotateCcw } from 'lucide-react';

const nodeTypes = {
  codeNode: CodeNode,
};

interface CodeflowVisualizerProps {
  graphData: {
    nodes?: Array<{
      id: string;
      type: string;
      file: string;
      name: string;
      metadata?: any;
    }>;
    edges?: Array<{
      source: string;
      target: string;
      type: string;
      metadata?: any;
    }>;
    metadata?: {
      total_nodes: number;
      total_edges: number;
      node_types: string[];
      edge_types: string[];
    };
  };
}

const getEdgeStyle = (edgeType: string) => {
  const styles = {
    imports: { stroke: 'hsl(var(--code-module))', strokeWidth: 2 },
    renders: { stroke: 'hsl(var(--code-component))', strokeWidth: 2 },
    calls: { stroke: 'hsl(var(--code-function))', strokeWidth: 2 },
    inherits: { stroke: 'hsl(var(--code-class))', strokeWidth: 2, strokeDasharray: '5,5' },
    routes_to: { stroke: 'hsl(var(--primary))', strokeWidth: 3 },
    calls_api: { stroke: 'hsl(var(--code-api))', strokeWidth: 2 },
    depends_on: { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '3,3' },
    uses: { stroke: 'hsl(var(--accent))', strokeWidth: 2 }
  };
  return styles[edgeType as keyof typeof styles] || { stroke: 'hsl(var(--border))', strokeWidth: 1 };
};

const CodeflowVisualizer = ({ graphData }: CodeflowVisualizerProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Convert backend data to React Flow format
  useEffect(() => {
    if (!graphData?.nodes || !graphData?.edges) {
      setNodes([]);
      setEdges([]);
      return;
    }
  
    // Deduplicate nodes
    const seen = new Set<string>();
    const flowNodes: Node[] = graphData.nodes
      .filter((n) => {
        if (seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
      })
      .map((node, index) => ({
        id: node.id, // ✅ keep backend ID
        type: 'codeNode',
        position: {
          x: (index % 6) * 300 + Math.random() * 100,
          y: Math.floor(index / 6) * 200 + Math.random() * 50,
        },
        data: {
          name: node.name,
          type: node.type,
          file: node.file,
          metadata: node.metadata,
        },
      }));
  
    // ✅ Build a lookup of node IDs
    const nodeIds = new Set(flowNodes.map((n) => n.id));
  
    // Convert edges but keep only valid ones
    const flowEdges: Edge[] = graphData.edges
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge, index) => ({
        id: `edge-${index}`,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        style: getEdgeStyle(edge.type),
        label: edge.type,
      }));
  
    console.log("Flow Nodes:", flowNodes);
    console.log("Flow Edges:", flowEdges);
  
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [graphData, setNodes, setEdges]);
  

  const onInit = useCallback((reactFlowInstance: any) => {
    setReactFlowInstance(reactFlowInstance);
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.1 });
    }, 100);
  }, []);

  const handleLayout = useCallback(() => {
    if (!reactFlowInstance || nodes.length === 0) return;
    
    // Simple radial layout
    const layoutedNodes = nodes.map((node, index) => {
      const angle = (index / nodes.length) * 2 * Math.PI;
      const radius = Math.min(300, nodes.length * 30);
      
      return {
        ...node,
        position: {
          x: Math.cos(angle) * radius + 400,
          y: Math.sin(angle) * radius + 300
        }
      };
    });
    
    setNodes(layoutedNodes);
    setTimeout(() => reactFlowInstance.fitView({ padding: 0.1 }), 100);
  }, [nodes, setNodes, reactFlowInstance]);

  const handleFitView = useCallback(() => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.1 });
    }
  }, [reactFlowInstance]);

  return (
    <div className="w-full h-full relative">
      {/* Graph Statistics */}
      <div className="absolute top-4 left-4 z-10 flex gap-2 flex-wrap">
        <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
          {graphData?.metadata?.total_nodes ?? 0} nodes
        </Badge>
        <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
          {graphData?.metadata?.total_edges ?? 0} edges
        </Badge>
        <Badge variant="outline" className="bg-background/80 backdrop-blur-sm">
          {graphData?.metadata?.node_types?.length ?? 0} types
        </Badge>
      </div>

      {/* Layout Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleLayout}
          className="bg-background/80 backdrop-blur-sm"
        >
          <RotateCcw className="w-4 h-4" />
          Auto Layout
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleFitView}
          className="bg-background/80 backdrop-blur-sm"
        >
          <Maximize2 className="w-4 h-4" />
          Fit View
        </Button>
      </div>

      {/* Legend */}
      {graphData?.metadata?.node_types && (
        <div className="absolute bottom-4 left-4 z-10 bg-background/80 backdrop-blur-sm rounded-lg p-3 border">
          <h4 className="text-sm font-semibold mb-2">Node Types</h4>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {graphData.metadata.node_types.map((type) => (
              <div key={type} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded border-l-2 ${
                  type === 'component' ? 'border-l-[hsl(var(--code-component))]' :
                  type === 'class' ? 'border-l-[hsl(var(--code-class))]' :
                  type === 'function' ? 'border-l-[hsl(var(--code-function))]' :
                  type === 'api_endpoint' ? 'border-l-[hsl(var(--code-api))]' :
                  type === 'module' ? 'border-l-[hsl(var(--code-module))]' :
                  type === 'controller' ? 'border-l-[hsl(var(--code-controller))]' :
                  type === 'service' ? 'border-l-[hsl(var(--code-service))]' :
                  'border-l-[hsl(var(--code-view))]'
                }`} />
                <span>{type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        attributionPosition="bottom-right"
        className="react-flow-container"
      >
        <Controls 
          showZoom={true}
          showFitView={true}
          showInteractive={true}
          className="react-flow__controls"
        />
        <MiniMap 
          nodeStrokeColor={(n) => getEdgeStyle((n.data as any)?.type || 'default').stroke as string || '#fff'}
          nodeColor={(n) => getEdgeStyle((n.data as any)?.type || 'default').stroke as string || '#fff'}
          nodeBorderRadius={8}
          className="react-flow__minimap"
        />
        <Background 
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="hsl(var(--border))"
        />
      </ReactFlow>
    </div>
  );
};

export default CodeflowVisualizer;
