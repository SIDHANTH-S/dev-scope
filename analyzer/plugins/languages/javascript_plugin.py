"""
JavaScript/TypeScript parsing plugin.
"""

import logging
import hashlib
from pathlib import Path
from typing import List, Dict, Any, Optional

from ..base import LanguagePlugin
from ...models import Node, NodeType


class JavaScriptPlugin(LanguagePlugin):
    """Plugin for parsing JavaScript/TypeScript files."""
    
    @property
    def language_name(self) -> str:
        return "javascript"
    
    def can_parse(self, file_extension: str) -> bool:
        return file_extension.lower() in ['.js', '.jsx', '.ts', '.tsx']
    
    def parse(self, file_path: Path, content: str, is_entry: bool = False) -> List[Node]:
        """Parse JavaScript/TypeScript file and return nodes."""
        nodes = []
        relative_path = str(file_path.relative_to(self.project_path))
        
        try:
            # Create module node for the file
            module_name = file_path.stem
            module_id = self._generate_node_id(relative_path, 'module')
            c4_level = self._determine_c4_level(NodeType.MODULE, relative_path, module_name, is_entry)
            module_node = Node(
                id=module_id,
                type=NodeType.MODULE,
                file=relative_path,
                name=module_name,
                metadata={"is_entry": is_entry, "c4_level": c4_level}
            )
            nodes.append(module_node)
            
            # Load tree-sitter language
            lang = self._get_ts_language()
            if not lang:
                logging.warning(f"Could not load Tree-sitter language for {file_path.suffix}")
                return nodes
            
            # Parse with tree-sitter
            tree = lang.parse(bytes(content, 'utf-8'))
            
            # Execute queries
            captures = self._execute_queries(lang, tree, content)
            
            # Process captures into nodes
            function_nodes = self._process_captures(captures, content, relative_path, file_path.suffix, is_entry)
            nodes.extend(function_nodes)
            
            # Store file symbols for semantic analysis
            self.file_symbols = getattr(self, 'file_symbols', {})
            self.file_symbols[relative_path] = {
                'declared': [node.name for node in function_nodes if node.name],
                'imports': [self._capture_text(content, node) for node in captures.get('import_path', [])]
            }
            
        except Exception as e:
            logging.error(f"Failed to parse JavaScript file {relative_path}: {e}")
        
        return nodes
    
    def _get_ts_language(self):
        """Get TypeScript/JavaScript language for tree-sitter."""
        try:
            import tree_sitter_javascript
            return tree_sitter_javascript.language()
        except ImportError:
            try:
                import tree_sitter_typescript
                return tree_sitter_typescript.language()
            except ImportError:
                logging.warning("Neither tree-sitter-javascript nor tree-sitter-typescript available")
                return None
    
    def _execute_queries(self, lang, tree, content: str) -> Dict[str, List]:
        """Execute tree-sitter queries and return captures."""
        captures = {
            'func_name': [],
            'var_func': [],
            'class_name': [],
            'import_path': [],
            'jsx_name': [],
            'called_names': []
        }
        
        try:
            # Core queries
            core_queries = self.queries.get('core', [])
            for query_str in core_queries:
                query = lang.query(query_str)
                query_captures = query.captures(tree.root_node)
                for capture_name, node in query_captures:
                    if capture_name in captures:
                        captures[capture_name].append(node)
            
            # JSX queries
            jsx_queries = self.queries.get('jsx', [])
            for query_str in jsx_queries:
                query = lang.query(query_str)
                jsx_captures = query.captures(tree.root_node)
                for capture_name, node in jsx_captures:
                    if capture_name == 'jsx_name':
                        captures['jsx_name'].append(node)
            
            # Call queries
            call_queries = self.queries.get('calls', [])
            for query_str in call_queries:
                query = lang.query(query_str)
                call_captures = query.captures(tree.root_node)
                for capture_name, node in call_captures:
                    if capture_name in ['callee', 'obj', 'prop']:
                        captures['called_names'].append(node)
                        
        except Exception as e:
            logging.warning(f"Query execution failed: {e}")
        
        return captures
    
    def _process_captures(self, captures: Dict[str, List], content: str, 
                         relative_path: str, ext: str, is_entry: bool) -> List[Node]:
        """Process tree-sitter captures into Node objects."""
        nodes = []
        declared_names = set()
        
        # Process classes
        for node in captures['class_name']:
            class_name = self._capture_text(content, node)
            if not class_name:
                continue
            declared_names.add(class_name)
            node_id = self._generate_node_id(relative_path, class_name)
            c4_level = self._determine_c4_level(NodeType.CLASS, relative_path, class_name, is_entry)
            graph_node = Node(
                id=node_id, type=NodeType.CLASS, file=relative_path, name=class_name,
                metadata={"is_entry": is_entry, "c4_level": c4_level}
            )
            nodes.append(graph_node)
        
        # Process functions and components
        func_nodes = captures['func_name'] + captures['var_func']
        for node in func_nodes:
            func_name = self._capture_text(content, node)
            if not func_name:
                continue
            declared_names.add(func_name)
            is_component = func_name[0].isupper() and ext in ['.tsx', '.jsx']
            node_type = NodeType.COMPONENT if is_component else NodeType.FUNCTION
            c4_level = self._determine_c4_level(node_type, relative_path, func_name, is_entry)
            node_id = self._generate_node_id(relative_path, func_name)
            graph_node = Node(
                id=node_id, type=node_type, file=relative_path, name=func_name,
                metadata={"is_entry": is_entry, "c4_level": c4_level}
            )
            nodes.append(graph_node)
        
        # Process JSX components
        for node in captures['jsx_name']:
            jsx_name = self._capture_text(content, node)
            if not jsx_name or jsx_name in declared_names:
                continue
            declared_names.add(jsx_name)
            node_id = self._generate_node_id(relative_path, jsx_name)
            c4_level = self._determine_c4_level(NodeType.COMPONENT, relative_path, jsx_name, is_entry)
            graph_node = Node(
                id=node_id, type=NodeType.COMPONENT, file=relative_path, name=jsx_name,
                metadata={"is_entry": is_entry, "c4_level": c4_level}
            )
            nodes.append(graph_node)
        
        return nodes
    
    def _capture_text(self, content: str, node) -> str:
        """Extract text content from a tree-sitter node."""
        return content[node.start_byte:node.end_byte]
    
    def _generate_node_id(self, file_path: str, name: str) -> str:
        """Generate a unique node ID."""
        content = f"{file_path}:{name}"
        return hashlib.md5(content.encode()).hexdigest()[:12]
    
    def _determine_c4_level(self, node_type: NodeType, file_path: str, name: str, is_entry: bool = False) -> str:
        """Determine C4 model level for a node."""
        # User overrides from .devscope.yml
        try:
            overrides = (self.user_config or {}).get('c4_overrides', {})
            # Path-based overrides
            for level, patterns in (overrides.get('path_contains', {}) or {}).items():
                for pat in patterns:
                    if pat and pat.lower() in file_path.lower():
                        return level
            # Type-based overrides
            for level, types in (overrides.get('node_types', {}) or {}).items():
                if node_type.value in types:
                    return level
        except Exception:
            pass
        
        # Default heuristics
        if node_type == NodeType.API_ENDPOINT:
            return "system"
        
        if is_entry or node_type == NodeType.MODULE:
            file_lower = file_path.lower()
            name_lower = name.lower()
            if (name_lower in ['main', 'app', 'index'] or
                'main.' in file_lower or
                file_lower.endswith(('main.tsx', 'main.ts', 'main.js', 'app.tsx'))):
                return "container"
        
        if node_type in [NodeType.COMPONENT, NodeType.VIEW, NodeType.CONTROLLER, NodeType.SERVICE]:
            return "component"
        
        if node_type == NodeType.MODULE:
            if any(segment in file_path.lower() for segment in ['pages', 'components', 'views', 'controllers', 'services']):
                return "component"
        
        if node_type in [NodeType.FUNCTION, NodeType.CLASS, NodeType.MODEL, NodeType.TEMPLATE]:
            return "code"
        
        return "code"
