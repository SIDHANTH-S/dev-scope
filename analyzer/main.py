"""
Main codebase analyzer orchestrator.
"""

import logging
from typing import Dict, Any

from .models import ProjectType
from .scanner import ProjectScanner
from .entry_points import EntryPointIdentifier
from .parser import LanguageParser


class WorkflowGraphGenerator:
    """Generates workflow graph from parsed nodes and edges."""
    
    def __init__(self, nodes, edges):
        """Initialize the graph generator.
        
        Args:
            nodes: List of parsed nodes
            edges: List of parsed edges
        """
        self.nodes = nodes
        self.edges = edges
        
    def generate(self) -> Dict[str, Any]:
        """Generate graph JSON for frontend.
        
        Returns:
            Dictionary containing nodes, edges, and metadata
        """
        return {
            "nodes": [node.to_dict() for node in self.nodes],
            "edges": [edge.to_dict() for edge in self.edges],
            "metadata": {
                "total_nodes": len(self.nodes),
                "total_edges": len(self.edges),
                "node_types": list(set(node.type.value for node in self.nodes)),
                "edge_types": list(set(edge.type.value for edge in self.edges))
            }
        }


class CodebaseAnalyzer:
    """Main codebase analyzer orchestrator."""
    
    def __init__(self):
        """Initialize the codebase analyzer."""
        self.project_path = None
        self.project_type = ProjectType.UNKNOWN
        self.scanner = None
        self.entry_identifier = None
        self.parser = None
        
    def analyze(self, folder_path: str) -> Dict[str, Any]:
        """Main analysis pipeline.
        
        Args:
            folder_path: Path to the project directory to analyze
            
        Returns:
            Dictionary containing project info and workflow graph
        """
        logging.info(f"Starting codebase analysis for: {folder_path}")
        
        self.project_path = folder_path
        
        try:
            # Step 1: Scan project
            self.scanner = ProjectScanner(folder_path)
            scan_results = self.scanner.scan()
            
            # Step 2: Determine project type
            self._determine_project_type()
            
            # Step 3: Identify entry points
            self.entry_identifier = EntryPointIdentifier(
                folder_path, 
                self.scanner.config_files,
                self.project_type
            )
            entry_points = self.entry_identifier.identify()
            
            # Step 4: Parse and analyze
            self.parser = LanguageParser(folder_path)
            self.parser.parse_project(entry_points, self.project_type)
            
            # Step 5: Generate workflow graph
            graph_generator = WorkflowGraphGenerator(
                self.parser.nodes,
                self.parser.edges
            )
            graph_data = graph_generator.generate()
            
            result = {
                "project_info": {
                    "path": folder_path,
                    "type": self.project_type.value,
                    "config_files": scan_results["config_files"],
                    "entry_points": entry_points
                },
                "graph": graph_data
            }
            
            logging.info(f"Analysis complete. Generated {graph_data['metadata']['total_nodes']} nodes "
                        f"and {graph_data['metadata']['total_edges']} edges")
            
            return result
            
        except Exception as e:
            logging.error(f"Analysis failed for {folder_path}: {e}")
            raise
    
    def _determine_project_type(self):
        """Determine the most specific project type from detected types."""
        if not self.scanner.detected_types:
            self.project_type = ProjectType.UNKNOWN
            return
            
        # Priority order for project types (most specific first)
        priority_order = [
            ProjectType.SPRING_BOOT,
            ProjectType.REACT_VITE,
            ProjectType.ANGULAR,
            ProjectType.DJANGO,
            ProjectType.EXPRESS_NODE,
            ProjectType.MAVEN_JAVA,
            ProjectType.GRADLE_JAVA,
            ProjectType.ANDROID,
            ProjectType.PYTHON_APP,
        ]
        
        for project_type in priority_order:
            if project_type in self.scanner.detected_types:
                self.project_type = project_type
                logging.info(f"Selected project type: {project_type.value}")
                return
        
        # Fallback to first detected type
        self.project_type = list(self.scanner.detected_types)[0]
        logging.info(f"Using fallback project type: {self.project_type.value}")
