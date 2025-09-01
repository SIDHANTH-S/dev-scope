import { Node, Edge } from '@xyflow/react';

export interface LayoutNode extends Node {
  level?: number;
  group?: string;
  importance?: number;
}

export class HierarchicalLayout {
  private nodes: LayoutNode[];
  private edges: Edge[];
  private nodesByLevel: Map<number, LayoutNode[]> = new Map();
  private nodesByGroup: Map<string, LayoutNode[]> = new Map();

  constructor(nodes: LayoutNode[], edges: Edge[]) {
    this.nodes = nodes;
    this.edges = edges;
  }

  public layout(): LayoutNode[] {
    // Step 1: Identify entry points and assign levels
    this.assignLevels();
    
    // Step 2: Group nodes by file structure
    this.groupNodes();
    
    // Step 3: Calculate positions
    return this.calculatePositions();
  }

  private assignLevels(): void {
    // Find entry points (nodes with is_entry = true)
    const entryNodes = this.nodes.filter(node => {
      const metadata = node.data?.metadata as any;
      return metadata?.is_entry === true;
    });
    
    // Assign levels based on distance from entry points
    const visited = new Set<string>();
    const queue: { node: LayoutNode; level: number }[] = [];
    
    // Start with entry points at level 0
    entryNodes.forEach(node => {
      node.level = 0;
      node.importance = 10; // High importance for entry points
      queue.push({ node, level: 0 });
      visited.add(node.id);
    });
    
    // BFS to assign levels
    while (queue.length > 0) {
      const { node: currentNode, level } = queue.shift()!;
      
      // Find all nodes that this node connects to
      const connectedEdges = this.edges.filter(edge => edge.source === currentNode.id);
      
      connectedEdges.forEach(edge => {
        const targetNode = this.nodes.find(n => n.id === edge.target);
        if (targetNode && !visited.has(targetNode.id)) {
          targetNode.level = level + 1;
          targetNode.importance = Math.max(0, 10 - level * 2); // Decrease importance with level
          queue.push({ node: targetNode, level: level + 1 });
          visited.add(targetNode.id);
        }
      });
    }
    
    // Assign default level for unvisited nodes
    this.nodes.forEach(node => {
      if (!visited.has(node.id)) {
        node.level = 5; // Put unconnected nodes at a lower level
        node.importance = 1;
      }
    });
  }

  private groupNodes(): void {
    this.nodes.forEach(node => {
      // Group by file directory
      const filePath = (node.data?.file as string) || '';
      const pathParts = typeof filePath === 'string' ? filePath.split('/') : [];
      
      if (pathParts.length > 1) {
        node.group = pathParts.slice(0, -1).join('/'); // Directory path
      } else {
        node.group = 'root';
      }
      
      // Group nodes by level
      const level = node.level || 0;
      if (!this.nodesByLevel.has(level)) {
        this.nodesByLevel.set(level, []);
      }
      this.nodesByLevel.get(level)!.push(node);
      
      // Group nodes by directory
      const group = node.group || 'root';
      if (!this.nodesByGroup.has(group)) {
        this.nodesByGroup.set(group, []);
      }
      this.nodesByGroup.get(group)!.push(node);
    });
  }

  private calculatePositions(): LayoutNode[] {
    const levelHeight = 300;
    const nodeSpacing = 250;
    const groupSpacing = 400;
    
    let globalY = 50;
    
    // Sort levels
    const sortedLevels = Array.from(this.nodesByLevel.keys()).sort((a, b) => a - b);
    
    sortedLevels.forEach(level => {
      const levelNodes = this.nodesByLevel.get(level) || [];
      
      // Group nodes by directory within this level
      const groupsAtLevel = new Map<string, LayoutNode[]>();
      levelNodes.forEach(node => {
        const group = node.group || 'root';
        if (!groupsAtLevel.has(group)) {
          groupsAtLevel.set(group, []);
        }
        groupsAtLevel.get(group)!.push(node);
      });
      
      let levelX = 50;
      
      // Position groups horizontally
      Array.from(groupsAtLevel.entries()).forEach(([groupName, groupNodes]) => {
        // Sort nodes within group by importance
        groupNodes.sort((a, b) => (b.importance || 0) - (a.importance || 0));
        
        groupNodes.forEach((node, index) => {
          node.position = {
            x: levelX + (index * nodeSpacing),
            y: globalY
          };
        });
        
        levelX += Math.max(groupNodes.length * nodeSpacing, groupSpacing);
      });
      
      globalY += levelHeight;
    });
    
    return this.nodes;
  }
}

export const applyHierarchicalLayout = (nodes: Node[], edges: Edge[]): Node[] => {
  const layout = new HierarchicalLayout(nodes as LayoutNode[], edges);
  return layout.layout();
};