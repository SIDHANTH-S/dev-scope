"""
Language parser for analyzing source code files.
"""

import os
import ast
import hashlib
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional, Set

import tree_sitter
from tree_sitter import Language, Parser

from .models import Node, Edge, NodeType, EdgeType, ProjectType
from .plugins.languages import JavaScriptPlugin, JavaPlugin, PythonPlugin

# -------------------------------------------------------------------
# Tree-sitter language setup (package-first, compiled fallback)
# -------------------------------------------------------------------
_LANGUAGE_CACHE: Dict[str, Any] = {}


def _compiled_lib_path() -> Optional[str]:
    ext = "dll" if os.name == "nt" else "so"
    lib_path = Path(__file__).resolve().parent.parent / "build" / f"languages.{ext}"
    return str(lib_path) if lib_path.exists() else None


def _load_from_compiled(name: str) -> Optional[Any]:
    """Load language from a compiled shared library if available."""
    try:
        lib_path = _compiled_lib_path()
        if not lib_path:
            return None
        cache_key = f"compiled::{name}::{lib_path}"
        if cache_key in _LANGUAGE_CACHE:
            return _LANGUAGE_CACHE[cache_key]
        lang = Language(lib_path, name)
        _LANGUAGE_CACHE[cache_key] = lang
        logging.debug(f"Loaded tree-sitter language '{name}' from compiled library: {lib_path}")
        return lang
    except Exception as e:
        logging.debug(f"Failed compiled load for '{name}': {e}")
        return None


class LanguageParser:
    """Parses source code files and extracts semantic information."""

    def __init__(self, project_path: str, user_config: Optional[Dict[str, Any]] = None):
        """Initialize the language parser.

        Args:
            project_path: Path to the project directory
            user_config: Optional user configuration for C4 level overrides
        """
        self.project_path = Path(project_path)
        self.user_config = user_config or {}
        self.file_asts: Dict[str, Any] = {}
        self.nodes: List[Node] = []
        self.edges: List[Edge] = []
        self.node_registry: Dict[str, Node] = {}
        self.file_symbols: Dict[str, Dict[str, Any]] = {}
        self.module_index: Dict[str, str] = {}
        self.parsed_files: Set[str] = set()
        # Incremental parsing cache: relative_path -> md5 hash
        self.file_cache: Dict[str, str] = {}
        
        # Initialize language plugins
        self.language_plugins = [
            JavaScriptPlugin(project_path, user_config),
            JavaPlugin(project_path, user_config),
            PythonPlugin(project_path, user_config)
        ]

    def _get_ts_language(self, ext: str):
        """Return a Tree-sitter language for JS/TS/TSX.

        Prefers per-language packages; falls back to a compiled shared lib if present.
        """
        try:
            if ext in ['.js', '.jsx']:
                try:
                    from tree_sitter_javascript import LANGUAGE as JS_LANGUAGE_PKG  # type: ignore
                    return JS_LANGUAGE_PKG
                except Exception:
                    return _load_from_compiled('javascript')
            if ext == '.ts':
                try:
                    from tree_sitter_typescript import LANGUAGE as TS_LANGUAGE_PKG  # type: ignore
                    return TS_LANGUAGE_PKG
                except Exception:
                    return _load_from_compiled('typescript')
            if ext == '.tsx':
                # Try TSX first, then fall back to TS
                try:
                    from tree_sitter_typescript import TSX_LANGUAGE as TSX_LANGUAGE_PKG  # type: ignore
                    return TSX_LANGUAGE_PKG
                except Exception:
                    try:
                        from tree_sitter_typescript import LANGUAGE as TS_LANGUAGE_PKG  # type: ignore
                        return TS_LANGUAGE_PKG
                    except Exception:
                        return _load_from_compiled('tsx') or _load_from_compiled('typescript')
        except Exception as e:
            logging.warning(f"Failed to load Tree-sitter language for {ext}: {e}")
        return None

    def _get_java_language(self):
        """Return a Tree-sitter language object for Java."""
        try:
            try:
                from tree_sitter_java import LANGUAGE as JAVA_LANGUAGE_PKG  # type: ignore
                return JAVA_LANGUAGE_PKG
            except Exception:
                return _load_from_compiled('java')
        except Exception as e:
            logging.warning(f"Failed to load Tree-sitter Java language: {e}")
        return None

    def _capture_text(self, source_code: str, node: Any) -> str:
        """Extract text content from a tree-sitter node."""
        return source_code[node.start_byte:node.end_byte]

    def _determine_c4_level(self, node_type: NodeType, file_path: str, name: str, is_entry: bool = False) -> str:
        """Determine C4 model level for a node based on type, file, and context."""
        # User overrides from .devscope.yml
        try:
            overrides = (self.user_config or {}).get('c4_overrides', {})
            # Path-based overrides: e.g., { "system": ["src/api/"] }
            for level, patterns in (overrides.get('path_contains', {}) or {}).items():
                for pat in patterns:
                    if pat and pat.lower() in file_path.lower():
                        return level
            # Type-based overrides: e.g., { "component": ["component", "view"] }
            for level, types in (overrides.get('node_types', {}) or {}).items():
                if node_type.value in types:
                    return level
        except Exception:
            pass
        
        # System level: API endpoints and external boundaries
        if node_type == NodeType.API_ENDPOINT:
            return "system"
        
        # Container level: Entry modules, main applications, root services
        if is_entry or node_type == NodeType.MODULE:
            # Check if it's a main entry file
            file_lower = file_path.lower()
            name_lower = name.lower()
            
            # Entry points and main modules
            if (name_lower in ['main', 'app', 'index'] or 
                'main.' in file_lower or 
                file_lower.endswith(('main.tsx', 'main.ts', 'main.js', 'app.tsx', 'app.py', 'urls.py')) or
                'springbootapplication' in name_lower):
                return "container"
        
        # Component level: React components, views, controllers, services
        if node_type in [NodeType.COMPONENT, NodeType.VIEW, NodeType.CONTROLLER, NodeType.SERVICE]:
            return "component"
        
        # Component level for modules that represent feature boundaries
        if node_type == NodeType.MODULE:
            # Check if it's a feature module (pages, components directories)
            if any(segment in file_path.lower() for segment in ['pages', 'components', 'views', 'controllers', 'services']):
                return "component"
        
        # Code level: Functions, classes, utilities
        if node_type in [NodeType.FUNCTION, NodeType.CLASS, NodeType.MODEL]:
            return "code"
        
        # Default to code level for unspecified types
        return "code"

    def parse_project(self, entry_points: List[Dict], project_type: ProjectType):
        """Parse project files starting from entry points."""
        logging.info(f"Starting parse for project: {self.project_path}")
        
        # Build index for module resolution
        self._build_module_index()
        
        # Start with entry points
        for entry in entry_points:
            file_path = self.project_path / entry['value']
            logging.debug(f"Checking entry point: {file_path} (exists: {file_path.exists()})")
            if file_path.exists() and file_path.is_file():
                self._parse_file(file_path, is_entry=True)
        
        # Parse other relevant files based on project type
        self._parse_additional_files(project_type)
        
        # Perform semantic analysis
        self._analyze_relationships()
        
        logging.info(f"Parse complete. Found {len(self.nodes)} nodes and {len(self.edges)} edges")
        
    def _parse_file(self, file_path: Path, is_entry: bool = False):
        """Parse individual file using appropriate language plugin."""
        ext = file_path.suffix.lower()
        relative_path = str(file_path.relative_to(self.project_path))

        # Skip node_modules and TypeScript declaration files
        if "node_modules" in relative_path or relative_path.endswith(".d.ts"):
            logging.debug(f"Skipping external/declaration file: {relative_path}")
            return

        # Skip if already parsed
        if relative_path in self.parsed_files:
            return

        try:
            # --- Caching logic ---
            content = file_path.read_text(encoding='utf-8')
            content_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
            if self.file_cache.get(relative_path) == content_hash:
                logging.debug(f"Cache hit for {relative_path}. Skipping parse.")
                self.parsed_files.add(relative_path)
                return

            # Mark as parsed before parsing to avoid recursion issues
            self.parsed_files.add(relative_path)

            # Find appropriate language plugin
            plugin = self._get_plugin_for_extension(ext)
            if plugin:
                nodes = plugin.parse(file_path, content, is_entry)
                self.nodes.extend(nodes)
                
                # Register nodes in the registry
                for node in nodes:
                    self.node_registry[node.id] = node
            else:
                # Fallback for HTML files (not yet pluginized)
                if ext == '.html':
                    self._parse_html_file(file_path, relative_path, is_entry)

            # Update cache on successful parse
            self.file_cache[relative_path] = content_hash
        except Exception as e:
            logging.error(f"Failed to parse file {relative_path}: {e}")
    
    def _get_plugin_for_extension(self, ext: str):
        """Get the appropriate language plugin for the file extension."""
        for plugin in self.language_plugins:
            if plugin.can_parse(ext):
                return plugin
        return None

    
    def _parse_python_file(self, file_path: Path, relative_path: str, is_entry: bool):
        """Parse Python file using AST."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            tree = ast.parse(content)
            
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    node_id = self._generate_node_id(relative_path, node.name)
                    c4_level = self._determine_c4_level(NodeType.CLASS, relative_path, node.name, is_entry)
                    graph_node = Node(
                        id=node_id,
                        type=NodeType.CLASS,
                        file=relative_path,
                        name=node.name,
                        metadata={"is_entry": is_entry, "c4_level": c4_level}
                    )
                    self.nodes.append(graph_node)
                    self.node_registry[node_id] = graph_node
                    
                elif isinstance(node, ast.FunctionDef):
                    node_id = self._generate_node_id(relative_path, node.name)
                    
                    # Check if it's a Django view
                    node_type = NodeType.VIEW if 'view' in node.name.lower() else NodeType.FUNCTION
                    c4_level = self._determine_c4_level(node_type, relative_path, node.name, is_entry)
                    
                    graph_node = Node(
                        id=node_id,
                        type=node_type,
                        file=relative_path,
                        name=node.name,
                        metadata={"is_entry": is_entry, "c4_level": c4_level}
                    )
                    self.nodes.append(graph_node)
                    self.node_registry[node_id] = graph_node
                    
                elif isinstance(node, ast.Import):
                    for alias in node.names:
                        self._add_import_edge(relative_path, alias.name)
                        
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        for alias in node.names:
                            self._add_import_edge(relative_path, f"{node.module}.{alias.name}")
            
            # Build Python symbol table for imports
            self._build_python_symbols(relative_path, tree)
            
        except (SyntaxError, UnicodeDecodeError, OSError) as e:
            logging.error(f"Failed to parse Python file {relative_path}: {e}")
    
    def _build_python_symbols(self, relative_path: str, tree: ast.AST):
        """Build symbol table for Python file."""
        try:
            imports: List[str] = []
            for n in ast.walk(tree):
                if isinstance(n, ast.Import):
                    for alias in n.names:
                        imports.append(alias.name)
                elif isinstance(n, ast.ImportFrom) and n.module:
                    for alias in n.names:
                        imports.append(f"{n.module}.{alias.name}")
            
            self.file_symbols[relative_path] = {
                **self.file_symbols.get(relative_path, {}),
                'imports': list({*self.file_symbols.get(relative_path, {}).get('imports', []), *imports}),
                'declared': list(self.file_symbols.get(relative_path, {}).get('declared', [])),
            }
        except Exception as e:
            logging.exception(f"Failed updating Python symbol table for {relative_path}: {e}")

    def _parse_javascript_file(self, file_path: Path, relative_path: str, is_entry: bool):
        """Parse JavaScript/TypeScript file with detailed logging."""
        logging.debug(f"Parsing JS/TS file: {relative_path}")
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            ext = file_path.suffix.lower()
            lang = self._get_ts_language(ext)

            # Check if language library loaded
            if not lang:
                logging.warning(f"Could not load Tree-sitter language for extension '{ext}'. Skipping file {relative_path}")
                return

            parser = Parser()
            parser.set_language(lang)
            tree = parser.parse(bytes(content, 'utf8'))
            root = tree.root_node

            # Define queries based on file type
            if ext in ['.tsx', '.jsx']:
                jsx_queries = [
                    "(jsx_opening_element name: (identifier) @jsx_name)",
                    "(jsx_self_closing_element name: (identifier) @jsx_name)",
                ]
            else:
                jsx_queries = []
                
            queries = [
                # Function declarations
                "(function_declaration name: (identifier) @func_name)",

                # Exported functions
                "(export_statement (function_declaration name: (identifier) @func_name))",

                # Arrow functions assigned to const/let
                "(lexical_declaration (variable_declarator "
                "name: (identifier) @var_func "
                "value: (arrow_function)))",

                # Normal functions assigned to const/let
                "(lexical_declaration (variable_declarator "
                "name: (identifier) @var_func "
                "value: (function_expression)))",

                # Class declarations
                "(class_declaration name: (identifier) @class_name)",

                # Class methods
                "(method_definition name: (property_identifier) @func_name)",

                # Imports
                "(import_statement source: (string) @import_path)",
            ] + jsx_queries



            captures: Dict[str, List[Any]] = {
                'func_name': [], 'var_func': [], 'class_name': [], 
                'import_path': [], 'jsx_name': []
            }
            
            for q_idx, q in enumerate(queries):
                try:
                    query = lang.query(q)
                    q_captures = query.captures(root)

                    logging.debug(f"Query {q_idx} found {len(q_captures)} captures")
                    
                    for node, name in q_captures:
                        if name in captures:
                            captures[name].append(node)
                except Exception as e:
                    logging.debug(f"Tree-sitter query skipped for {relative_path}: {e}")
                    continue

            # Process captures
            self._process_js_captures(captures, content, relative_path, ext, is_entry)

            logging.debug(f"Finished parsing {relative_path}. Total nodes: {len(self.nodes)}")

        except (UnicodeDecodeError, OSError) as e:
            logging.error(f"Failed to read JS/TS file {relative_path}: {e}")
        except Exception as e:
            logging.error(f"Fatal error parsing {relative_path}: {e}")
            logging.exception("Detailed traceback for parsing failure:")
    
    def _process_js_captures(self, captures: Dict[str, List[Any]], content: str, 
                           relative_path: str, ext: str, is_entry: bool):
        """Process JavaScript/TypeScript captures into nodes."""
        declared_names: Set[str] = set()
        
        # Process classes
        for node in captures['class_name']:
            class_name = self._capture_text(content, node)
            if not class_name:
                continue
            declared_names.add(class_name)
            node_id = self._generate_node_id(relative_path, class_name)
            c4_level = self._determine_c4_level(NodeType.CLASS, relative_path, class_name, is_entry)
            graph_node = Node(
                id=node_id, 
                type=NodeType.CLASS, 
                file=relative_path, 
                name=class_name, 
                metadata={"is_entry": is_entry, "c4_level": c4_level}
            )
            self.nodes.append(graph_node)
            self.node_registry[node_id] = graph_node

        # Process functions
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
                id=node_id, 
                type=node_type, 
                file=relative_path, 
                name=func_name, 
                metadata={"is_entry": is_entry, "c4_level": c4_level}
            )
            self.nodes.append(graph_node)
            self.node_registry[node_id] = graph_node

        # Process imports
        for node in captures['import_path']:
            raw = self._capture_text(content, node)
            import_path = raw.strip().strip('"\'')
            if import_path:
                self._add_import_edge(relative_path, import_path)

        # Process JSX components
        jsx_names: List[str] = []
        for node in captures['jsx_name']:
            jsx_name = self._capture_text(content, node)
            if jsx_name and jsx_name[0].isupper():
                jsx_names.append(jsx_name)
        
        if jsx_names:
            self.file_symbols[relative_path] = {
                **self.file_symbols.get(relative_path, {}), 
                'jsx_components': jsx_names
            }

        if declared_names:
            self.file_symbols[relative_path] = {
                **self.file_symbols.get(relative_path, {}), 
                'declared': list({*self.file_symbols.get(relative_path, {}).get('declared', []), *declared_names})
            }
    
    def _parse_java_file(self, file_path: Path, relative_path: str, is_entry: bool):
        """Parse Java file using Tree-sitter."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            lang = self._get_java_language()
            if not lang:
                logging.warning(f"Could not load Java language. Skipping {relative_path}")
                return

            parser = Parser()
            parser.set_language(lang)
            tree = parser.parse(bytes(content, 'utf8'))
            root = tree.root_node

            queries = [
                # class Foo {}
                "(class_declaration name: (identifier) @class_name)",
                # Annotations on classes or methods
                "(annotation name: (identifier) @ann_name)",
                "(marker_annotation name: (identifier) @ann_name)",
                # Spring mappings: @GetMapping("/path") etc
                "(annotation name: (identifier) @map_ann (annotation_argument_list (string_literal) @map_path))",
            ]

            captures: Dict[str, List[Any]] = {
                'class_name': [], 'ann_name': [], 'map_ann': [], 'map_path': []
            }
            
            for q in queries:
                try:
                    query = lang.query(q)
                    q_captures = query.captures(root)

                    for node, name in q_captures:
                        if name in captures:
                            captures[name].append(node)
                except Exception as e:
                    logging.warning(f"Java query failed for {relative_path}: {e}")
                    continue

            # Process Java captures
            self._process_java_captures(captures, content, relative_path, is_entry)

        except (UnicodeDecodeError, OSError) as e:
            logging.error(f"Failed to read Java file {relative_path}: {e}")
        except Exception as e:
            logging.error(f"Failed to parse Java file {relative_path}: {e}")
    
    def _process_java_captures(self, captures: Dict[str, List[Any]], content: str, 
                             relative_path: str, is_entry: bool):
        """Process Java captures into nodes."""
        # Determine if file has controller/service annotations
        annotation_names: Set[str] = set()
        for node in captures['ann_name']:
            annotation_names.add(self._capture_text(content, node))

        is_controller = any(name in {'Controller', 'RestController'} for name in annotation_names)
        is_service = any(name == 'Service' for name in annotation_names)

        # Process classes
        for node in captures['class_name']:
            class_name = self._capture_text(content, node)
            if not class_name:
                continue
            node_type = NodeType.CONTROLLER if is_controller else (NodeType.SERVICE if is_service else NodeType.CLASS)
            c4_level = self._determine_c4_level(node_type, relative_path, class_name, is_entry)
            node_id = self._generate_node_id(relative_path, class_name)
            graph_node = Node(
                id=node_id,
                type=node_type,
                file=relative_path,
                name=class_name,
                metadata={"is_entry": is_entry, "c4_level": c4_level}
            )
            self.nodes.append(graph_node)
            self.node_registry[node_id] = graph_node

        # Process API endpoints from Spring mapping annotations
        for ann_node, path_node in zip(captures.get('map_ann', []), captures.get('map_path', [])):
            ann_name = self._capture_text(content, ann_node)
            if ann_name not in {'GetMapping', 'PostMapping', 'PutMapping', 'DeleteMapping', 'RequestMapping'}:
                continue
            raw = self._capture_text(content, path_node)
            endpoint_path = raw.strip().strip('"\'')
            if not endpoint_path:
                continue
            api_node_id = f"api_{hashlib.md5(endpoint_path.encode()).hexdigest()[:8]}"
            if api_node_id not in self.node_registry:
                c4_level = self._determine_c4_level(NodeType.API_ENDPOINT, relative_path, endpoint_path, False)
                api_node = Node(
                    id=api_node_id,
                    type=NodeType.API_ENDPOINT,
                    file=relative_path,
                    name=endpoint_path,
                    metadata={"endpoint": endpoint_path, "c4_level": c4_level}
                )
                self.nodes.append(api_node)
                self.node_registry[api_node_id] = api_node
    
    def _parse_html_file(self, file_path: Path, relative_path: str, is_entry: bool):
        """Parse HTML file."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            node_id = self._generate_node_id(relative_path, "template")
            c4_level = self._determine_c4_level(NodeType.TEMPLATE, relative_path, file_path.stem, is_entry)
            graph_node = Node(
                id=node_id,
                type=NodeType.TEMPLATE,
                file=relative_path,
                name=file_path.stem,
                metadata={"is_entry": is_entry, "c4_level": c4_level}
            )
            self.nodes.append(graph_node)
            self.node_registry[node_id] = graph_node
            
        except (UnicodeDecodeError, OSError) as e:
            logging.error(f"Failed to read HTML file {relative_path}: {e}")
    
    def _parse_additional_files(self, project_type: ProjectType):
        """Parse additional files based on project type."""
        extensions_to_parse = set()
        
        if project_type in [ProjectType.REACT_VITE, ProjectType.ANGULAR, ProjectType.EXPRESS_NODE]:
            extensions_to_parse.update(['.js', '.jsx', '.ts', '.tsx'])
        elif project_type in [ProjectType.DJANGO, ProjectType.PYTHON_APP]:
            extensions_to_parse.add('.py')
        elif project_type in [ProjectType.MAVEN_JAVA, ProjectType.GRADLE_JAVA, ProjectType.SPRING_BOOT]:
            extensions_to_parse.add('.java')
        
        # Parse src directory and other common locations
        for location in ['src', 'app', 'lib', 'components', 'pages', 'api', 'server']:
            location_path = self.project_path / location
            if location_path.exists():
                for root, dirs, files in os.walk(location_path):
                    # Skip node_modules and other build directories
                    dirs[:] = [d for d in dirs if d not in {
                        'node_modules', '_pycache_', '.git', '__pycache__'
                    }]
                    
                    for file in files:
                        file_path = Path(root) / file
                        if file_path.suffix.lower() in extensions_to_parse:
                            self._parse_file(file_path)
    
    def _analyze_relationships(self):
        """Analyze semantic relationships between nodes."""
        logging.info("Analyzing relationships between nodes")
        
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

        # CALLS: JS/TS
        for n in self.nodes:
            if n.file.endswith(('.js', '.jsx', '.ts', '.tsx')) and n.type in {NodeType.FUNCTION, NodeType.COMPONENT, NodeType.CLASS}:
                self._analyze_js_calls(n.file, n)

        # CALLS: Python
        for n in self.nodes:
            if n.file.endswith('.py') and n.type in {NodeType.FUNCTION, NodeType.CLASS, NodeType.VIEW}:
                self._analyze_py_calls(n.file, n)
    
    def _add_import_edge(self, from_file: str, import_path: str):
        """Add import edge between files."""
        try:
            target_rel = self._resolve_import_target(from_file, import_path)
            if not target_rel:
                return
            source_module_id = self._generate_node_id(from_file, 'module')
            target_module_id = self._generate_node_id(target_rel, 'module')
            if source_module_id not in self.node_registry:
                src_name = Path(from_file).stem
                c4_level = self._determine_c4_level(NodeType.MODULE, from_file, src_name, False)
                src_node = Node(
                    id=source_module_id, 
                    type=NodeType.MODULE, 
                    file=from_file, 
                    name=src_name,
                    metadata={"c4_level": c4_level}
                )
                self.nodes.append(src_node)
                self.node_registry[source_module_id] = src_node
            if target_module_id not in self.node_registry:
                tgt_name = Path(target_rel).stem
                c4_level = self._determine_c4_level(NodeType.MODULE, target_rel, tgt_name, False)
                tgt_node = Node(
                    id=target_module_id, 
                    type=NodeType.MODULE, 
                    file=target_rel, 
                    name=tgt_name,
                    metadata={"c4_level": c4_level}
                )
                self.nodes.append(tgt_node)
                self.node_registry[target_module_id] = tgt_node
            self.edges.append(Edge(source=source_module_id, target=target_module_id, type=EdgeType.DEPENDS_ON))
        except Exception as e:
            logging.exception(f"Failed to add import edge {from_file} -> {import_path}: {e}")

    def _build_module_index(self):
        """Build index of modules for import resolution."""
        try:
            exts = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.java']
            src_roots = ['src', 'app', 'lib', 'components', 'pages', 'server', 'api']
            for root, dirs, files in os.walk(self.project_path):
                dirs[:] = [d for d in dirs if d not in {
                    '.git', 'node_modules', '__pycache__', 'build', 'dist', 'target'
                }]
                for fname in files:
                    fp = Path(root) / fname
                    if fp.suffix.lower() not in exts:
                        continue
                    rel = str(fp.relative_to(self.project_path))
                    self.module_index[self._normalize_module_key(rel)] = rel
                    if fp.stem == 'index' and fp.parent != self.project_path:
                        folder_key = self._normalize_module_key(str(fp.parent.relative_to(self.project_path)))
                        self.module_index[folder_key] = rel
                    for root_dir in src_roots:
                        if rel.startswith(root_dir + os.sep):
                            key = self._normalize_module_key(rel[len(root_dir) + 1:])
                            self.module_index[key] = rel
        except Exception as e:
            logging.exception(f"Module index build failed: {e}")

    def _normalize_module_key(self, s: str) -> str:
        """Normalize module key for consistent lookups."""
        return s.replace('\\\\', '/').replace('\\', '/').rstrip('/')

    def _resolve_import_target(self, from_file: str, specifier: str) -> Optional[str]:
        """Resolve import target to actual file path."""
        try:
            base_dir = str((self.project_path / from_file).parent)
            candidates: List[Path] = []

            def push_with_exts(p: Path):
                if p.suffix:
                    candidates.append(p)
                    return
                for ext in ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java']:
                    candidates.append(p.with_suffix(ext))
                candidates.append(p / 'index.ts')
                candidates.append(p / 'index.tsx')
                candidates.append(p / 'index.js')
                candidates.append(p / 'index.jsx')
                candidates.append(p / '__init__.py')

            if specifier.startswith('./') or specifier.startswith('../'):
                push_with_exts(Path(base_dir) / specifier)
            else:
                norm = self._normalize_module_key(specifier)
                if norm in self.module_index:
                    return self.module_index[norm]
                for root in ['src', 'app', 'lib']:
                    push_with_exts(self.project_path / root / specifier)
                for k, rel in self.module_index.items():
                    if k.endswith('/' + norm) or k == norm:
                        return rel

            for cand in candidates:
                if cand.exists():
                    return str(cand.relative_to(self.project_path))
            return None
        except Exception as e:
            logging.exception(f"Import resolve failed for {specifier} from {from_file}: {e}")
            return None

    def _analyze_js_calls(self, relative_path: str, scope_node: Node):
        """Analyze function calls in JavaScript/TypeScript files."""
        try:
            file_path = self.project_path / relative_path
            if not file_path.exists():
                return
            content = file_path.read_text(encoding='utf-8')
            lang = self._get_ts_language(Path(relative_path).suffix.lower())
            if not lang:
                return
            parser = Parser()
            parser.set_language(lang)
            tree = parser.parse(content.encode('utf-8'))
            root = tree.root_node
    
            # Updated queries
            queries = [
                "(call_expression function: (identifier) @callee)",
                "(call_expression function: (member_expression "
                "object: (identifier) @obj "
                "property: (property_identifier) @prop))",
            ]
    
            called_names: Set[str] = set()
            for q in queries:
                try:
                    query = lang.query(q)
                    for node, capture_name in query.captures(root):
                        text = self._capture_text(content, node)
                        if capture_name in {'callee', 'prop'} and text:
                            called_names.add(text)
                except Exception as e:
                    logging.warning(f"JS call analysis query failed: {e}")
                    continue
                
            # Link calls to known nodes
            for called in called_names:
                targets = [n for n in self.nodes if n.name == called]
                for tgt in targets:
                    self.edges.append(Edge(source=scope_node.id, target=tgt.id, type=EdgeType.CALLS))
        except Exception as e:
            logging.exception(f"JS calls analysis failed for {relative_path}: {e}")
    

    def _analyze_py_calls(self, relative_path: str, scope_node: Node):
        """Analyze function calls in Python files."""
        try:
            file_path = self.project_path / relative_path
            if not file_path.exists():
                return
            content = file_path.read_text(encoding='utf-8')
            tree = ast.parse(content)
            called_names: Set[str] = set()
            for n in ast.walk(tree):
                if isinstance(n, ast.Call):
                    if isinstance(n.func, ast.Name):
                        called_names.add(n.func.id)
                    elif isinstance(n.func, ast.Attribute):
                        called_names.add(n.func.attr)
            for called in called_names:
                targets = [n for n in self.nodes if n.name == called]
                for tgt in targets:
                    self.edges.append(Edge(source=scope_node.id, target=tgt.id, type=EdgeType.CALLS))
        except Exception as e:
            logging.exception(f"Python calls analysis failed for {relative_path}: {e}")
    
    def _generate_node_id(self, file_path: str, name: str) -> str:
        """Generate unique node ID using hash for better uniqueness."""
        # Use hash to avoid collisions and make IDs more stable
        content = f"{file_path}:{name}"
        hash_suffix = hashlib.md5(content.encode()).hexdigest()[:8]
        return f"{file_path.replace('/', '_').replace('.', '_')}_{name}_{hash_suffix}"
        
        
        