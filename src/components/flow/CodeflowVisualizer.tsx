import React, { useCallback, useEffect, useState, useMemo } from 'react';
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
import FilterControls from './FilterControls';
import { applyHierarchicalLayout } from './layouts/HierarchicalLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Filter } from 'lucide-react';

const nodeTypes = {
  codeNode: CodeNode,
};

interface CodeflowVisualizerProps {
  graphData: {
    nodes: Array<{
      id: string;
      type: string;
      file: string;
      name: string;
      metadata?: any;
    }>;
    edges: Array<{
      source: string;
      target: string;
      type: string;
      metadata?: any;
    }>;
    metadata: {
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
  const [showFilters, setShowFilters] = useState(false);
  const [visibleEdgeTypes, setVisibleEdgeTypes] = useState<Set<string>>(new Set());
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  // Initialize visible types
  useEffect(() => {
    if (graphData.metadata) {
      setVisibleEdgeTypes(new Set(graphData.metadata.edge_types));
      setVisibleNodeTypes(new Set(graphData.metadata.node_types));
    }
  }, [graphData.metadata]);

  // Convert backend data to React Flow format
  useEffect(() => {
    if (!graphData.nodes || !graphData.edges) return;

    // Convert nodes with importance calculation
    const flowNodes: Node[] = graphData.nodes.map((node) => ({
      id: node.id,
      type: 'codeNode',
      position: { x: 0, y: 0 }, // Will be set by layout algorithm
      data: {
        name: node.name,
        type: node.type,
        file: node.file,
        metadata: node.metadata,
        importance: node.metadata?.is_entry ? 10 : Math.random() * 5 + 1
      }
    }));

    // Apply hierarchical layout
    const layoutedNodes = applyHierarchicalLayout(flowNodes, graphData.edges.map((edge, index) => ({
      id: `edge-${index}`,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep'
    })));

    // Convert edges
    const flowEdges: Edge[] = graphData.edges.map((edge, index) => ({
      id: `edge-${index}`,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      style: getEdgeStyle(edge.type),
      label: edge.type,
      labelStyle: { 
        fontSize: 10, 
        fontWeight: 600,
        color: 'hsl(var(--muted-foreground))'
      },
      labelBgStyle: { 
        fill: 'hsl(var(--background))', 
        fillOpacity: 0.8 
      },
      animated: edge.type === 'routes_to' || edge.type === 'calls_api'
    }));

    setNodes(layoutedNodes);
    setEdges(flowEdges);
  }, [graphData, setNodes, setEdges]);

  const onInit = useCallback((reactFlowInstance: any) => {
    setReactFlowInstance(reactFlowInstance);
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.1 });
    }, 100);
  }, []);

  const handleLayout = useCallback(() => {
    if (!reactFlowInstance || !graphData.nodes || !graphData.edges) return;
    
    // Re-apply hierarchical layout
    const layoutedNodes = applyHierarchicalLayout(nodes, edges);
    setNodes(layoutedNodes);
    setTimeout(() => reactFlowInstance.fitView({ padding: 0.1 }), 100);
  }, [nodes, edges, setNodes, reactFlowInstance, graphData]);

  const handleFitView = useCallback(() => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.1 });
    }
  }, [reactFlowInstance]);

  // Filter nodes and edges based on search and visibility settings
  const filteredNodes = useMemo(() => {
    return nodes.filter(node => {
      const matchesSearch = searchTerm === '' || 
        node.data?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        node.data?.file?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = visibleNodeTypes.has(node.data?.type || '');
      
      return matchesSearch && matchesType;
    });
  }, [nodes, searchTerm, visibleNodeTypes]);

  const filteredEdges = useMemo(() => {
    return edges.filter(edge => {
      const edgeTypeFromLabel = edge.label || edge.type || '';
      return visibleEdgeTypes.has(edgeTypeFromLabel);
    });
  }, [edges, visibleEdgeTypes]);

  // Filter control handlers
  const handleEdgeTypeToggle = useCallback((type: string) => {
    setVisibleEdgeTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  }, []);

  const handleNodeTypeToggle = useCallback((type: string) => {
    setVisibleNodeTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  }, []);

  const handleShowAllEdges = useCallback(() => {
    setVisibleEdgeTypes(new Set(graphData.metadata?.edge_types || []));
  }, [graphData.metadata]);

  const handleHideAllEdges = useCallback(() => {
    setVisibleEdgeTypes(new Set());
  }, []);

  return (
    <div className="w-full h-full relative">
      {/* Graph Statistics */}
      <div className="absolute top-4 left-4 z-10 flex gap-2 flex-wrap">
        <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
          {graphData.metadata.total_nodes} nodes
        </Badge>
        <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
          {graphData.metadata.total_edges} edges
        </Badge>
        <Badge variant="outline" className="bg-background/80 backdrop-blur-sm">
          {graphData.metadata.node_types.length} types
        </Badge>
      </div>

      {/* Layout Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="bg-background/80 backdrop-blur-sm"
        >
          <Filter className="w-4 h-4" />
          Filters
        </Button>
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

      {/* Filter Controls */}
      {showFilters && (
        <FilterControls
          edgeTypes={graphData.metadata?.edge_types || []}
          nodeTypes={graphData.metadata?.node_types || []}
          visibleEdgeTypes={visibleEdgeTypes}
          visibleNodeTypes={visibleNodeTypes}
          searchTerm={searchTerm}
          onEdgeTypeToggle={handleEdgeTypeToggle}
          onNodeTypeToggle={handleNodeTypeToggle}
          onSearchChange={setSearchTerm}
          onShowAllEdges={handleShowAllEdges}
          onHideAllEdges={handleHideAllEdges}
        />
      )}

      {/* Legend */}
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