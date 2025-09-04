"""
Semantic analyzer module to derive relationships between nodes after parsing.
"""

import logging
from typing import List, Dict

from .models import Node, Edge, EdgeType, NodeType


class SemanticAnalyzer:
    """Derives relationships (edges) from parsed nodes and symbols."""

    def __init__(self, nodes: List[Node], file_symbols: Dict[str, Dict]):
        self.nodes = nodes
        self.file_symbols = file_symbols or {}
        self.edges: List[Edge] = []

    def analyze(self) -> List[Edge]:
        logging.info("Running semantic analysis (relationships)")
        self._analyze_renders()
        self._analyze_calls()
        # Placeholders for future analyses
        self._analyze_data_flow()
        self._resolve_dependency_injection()
        return self.edges

    def _analyze_renders(self):
        # RENDERS: use jsx_components captured per file
        for file, meta in list(self.file_symbols.items()):
            jsx_list = (meta or {}).get('jsx_components', [])
            if not jsx_list:
                continue
            source_components = [n for n in self.nodes if n.file == file and n.type == NodeType.COMPONENT]
            if not source_components:
                continue
            for jsx_name in jsx_list:
                targets = [n for n in self.nodes if n.name == jsx_name and n.type == NodeType.COMPONENT]
                for src in source_components:
                    for tgt in targets:
                        self.edges.append(Edge(source=src.id, target=tgt.id, type=EdgeType.RENDERS))

    def _analyze_calls(self):
        # JS/TS calls are attached via parser queries into file_symbols['called_names'] in future
        # For now, re-use available simple cross-file name matching
        for src in self.nodes:
            if src.type in {NodeType.FUNCTION, NodeType.COMPONENT, NodeType.CLASS}:
                # Naive scan: find same-name targets and connect
                targets = [n for n in self.nodes if n is not src and n.name == src.name]
                for tgt in targets:
                    self.edges.append(Edge(source=src.id, target=tgt.id, type=EdgeType.CALLS))

    def _analyze_data_flow(self):
        # Placeholder for future data flow analysis
        pass

    def _resolve_dependency_injection(self):
        # Placeholder for future DI resolution
        pass
