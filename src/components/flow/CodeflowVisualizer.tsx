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
  BackgroundVariant,
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
    uses: { stroke: 'hsl(var(--accent))', strokeWidth: 2 },
  };
  return styles[edgeType as keyof typeof styles] || { stroke: 'hsl(var(--border))', strokeWidth: 1 };
};

const CodeflowVisualizer = ({ graphData }: CodeflowVisualizerProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [viewLevel, setViewLevel] = useState<'system' | 'container' | 'component' | 'code' | 'all'>('container');

  // Convert backend data to React Flow format
  useEffect(() => {
    if (!graphData?.nodes || !graphData?.edges) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const seen = new Set<string>();
    const flowNodes: Node[] = graphData.nodes
      .filter((n) => {
        if (seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
      })
      .map((node, index) => ({
        id: node.id,
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

    const flowEdges: Edge[] = graphData.edges.map((edge, index) => ({
      id: `edge-${index}`,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      style: getEdgeStyle(edge.type),
      label: edge.type,
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [graphData, setNodes, setEdges]);

  // Filter nodes/edges based on C4 view level
  const filteredNodes = nodes.filter(
    (n) => viewLevel === 'all' || n.data.metadata?.c4_level === viewLevel
  );

  const filteredEdges = edges.filter(
    (e) => filteredNodes.find((n) => n.id === e.source) && filteredNodes.find((n) => n.id === e.target)
  );

  const onInit = useCallback((reactFlowInstance: any) => {
    setReactFlowInstance(reactFlowInstance);
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.1 });
    }, 100);
  }, []);

  const handleLayout = useCallback(() => {
    if (!reactFlowInstance || filteredNodes.length === 0) return;

    const layoutedNodes = filteredNodes.map((node, index) => {
      const angle = (index / filteredNodes.length) * 2 * Math.PI;
      const radius = Math.min(300, filteredNodes.length * 30);

      return {
        ...node,
        position: {
          x: Math.cos(angle) * radius + 400,
          y: Math.sin(angle) * radius + 300,
        },
      };
    });

    setNodes(layoutedNodes);
    setTimeout(() => reactFlowInstance.fitView({ padding: 0.1 }), 100);
  }, [filteredNodes, setNodes, reactFlowInstance]);

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
          {filteredNodes.length} nodes
        </Badge>
        <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
          {filteredEdges.length} edges
        </Badge>
        <Badge variant="outline" className="bg-background/80 backdrop-blur-sm">
          View: {viewLevel}
        </Badge>
      </div>

      {/* Layout + Level Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2 flex-wrap">
        {['system', 'container', 'component', 'code', 'all'].map((level) => (
          <Button
            key={level}
            variant={viewLevel === level ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewLevel(level as any)}
            className="bg-background/80 backdrop-blur-sm capitalize"
          >
            {level}
          </Button>
        ))}
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

      <ReactFlow
        nodes={filteredNodes}
        edges={filteredEdges}
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
          nodeStrokeColor={(n) => getEdgeStyle((n.data as any)?.type || 'default').stroke as string}
          nodeColor={(n) => getEdgeStyle((n.data as any)?.type || 'default').stroke as string}
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
