"""
Project scanner for detecting project types and configuration files.
"""

import os
import json
import logging
from pathlib import Path
from typing import Dict, List, Any, Set

from .models import ProjectType, ConfigFile


class ProjectScanner:
    """Scans a project directory to detect project type and configuration files."""
    
    CONFIG_PATTERNS = {
        'pom.xml': ProjectType.MAVEN_JAVA,
        'build.gradle': ProjectType.GRADLE_JAVA,
        'package.json': ProjectType.REACT_VITE,  # Will be refined later
        'angular.json': ProjectType.ANGULAR,
        'settings.py': ProjectType.DJANGO,
        'urls.py': ProjectType.DJANGO,
        'requirements.txt': ProjectType.PYTHON_APP,
        'AndroidManifest.xml': ProjectType.ANDROID,
        'vite.config.ts': ProjectType.REACT_VITE,
        'vite.config.js': ProjectType.REACT_VITE,
    }
    
    def __init__(self, project_path: str):
        """Initialize the project scanner.
        
        Args:
            project_path: Path to the project directory to scan
        """
        self.project_path = Path(project_path)
        self.config_files: List[ConfigFile] = []
        self.detected_types: Set[ProjectType] = set()
        
    def scan(self) -> Dict[str, Any]:
        """Recursively scan project folder for configuration files.
        
        Returns:
            Dictionary containing config files and detected project types
        """
        if not self.project_path.exists():
            raise ValueError(f"Path {self.project_path} does not exist")
            
        logging.info(f"Scanning project at: {self.project_path}")
        
        for root, dirs, files in os.walk(self.project_path):
            # Skip common directories that shouldn't be scanned
            dirs[:] = [d for d in dirs if d not in {
                '.git', 'node_modules', '_pycache_', '.venv', 'venv', 
                'target', 'build', 'dist', '__pycache__'
            }]
            
            for file in files:
                file_path = Path(root) / file
                relative_path = file_path.relative_to(self.project_path)
                
                # Check if it's a config file
                for pattern, project_type in self.CONFIG_PATTERNS.items():
                    if file == pattern:
                        config = ConfigFile(
                            path=str(relative_path),
                            type=pattern
                        )
                        self.config_files.append(config)
                        self.detected_types.add(project_type)
                        logging.debug(f"Found config file: {relative_path} -> {project_type.value}")
                        
                        # Load config content for certain files
                        if pattern in ['package.json', 'angular.json']:
                            try:
                                with open(file_path, 'r', encoding='utf-8') as f:
                                    config.content = json.load(f)
                            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                                logging.warning(f"Failed to parse {pattern} at {relative_path}: {e}")
                                
        # Content-based enhancement of detection
        self._enhance_detection_from_content()
        
        logging.info(f"Scan complete. Found {len(self.config_files)} config files, "
                    f"detected types: {[t.value for t in self.detected_types]}")
        
        return {
            "config_files": [{"path": c.path, "type": c.type} for c in self.config_files],
            "detected_types": [t.value for t in self.detected_types] or [ProjectType.UNKNOWN.value]
        }
    
    def _enhance_detection_from_content(self):
        """Enhance project type detection based on config file content."""
        for config in self.config_files:
            fpath = self.project_path / config.path
            try:
                if config.type == 'package.json':
                    self._analyze_package_json(fpath)
                elif config.type == 'pom.xml':
                    self._analyze_pom_xml(fpath)
                elif config.type == 'build.gradle':
                    self._analyze_build_gradle(fpath)
                elif config.type == 'requirements.txt':
                    self._analyze_requirements_txt(fpath)
            except Exception as e:
                logging.exception(f"Failed reading config {config.path}: {e}")
    
    def _analyze_package_json(self, fpath: Path):
        """Analyze package.json for project type hints."""
        try:
            pkg = json.loads(fpath.read_text(encoding='utf-8'))
            deps = {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}
            
            if any(k in deps for k in ['react', 'react-dom']) or 'vite' in deps:
                self.detected_types.add(ProjectType.REACT_VITE)
            if '@angular/core' in deps:
                self.detected_types.add(ProjectType.ANGULAR)
            if 'express' in deps:
                self.detected_types.add(ProjectType.EXPRESS_NODE)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            logging.warning(f"Failed to analyze package.json: {e}")
    
    def _analyze_pom_xml(self, fpath: Path):
        """Analyze pom.xml for project type hints."""
        try:
            text = fpath.read_text(encoding='utf-8')
            if 'spring-boot-starter' in text:
                self.detected_types.add(ProjectType.SPRING_BOOT)
            self.detected_types.add(ProjectType.MAVEN_JAVA)
        except UnicodeDecodeError as e:
            logging.warning(f"Failed to analyze pom.xml: {e}")
    
    def _analyze_build_gradle(self, fpath: Path):
        """Analyze build.gradle for project type hints."""
        try:
            content = fpath.read_text(encoding='utf-8')
            if 'org.springframework.boot' in content:
                self.detected_types.add(ProjectType.SPRING_BOOT)
            self.detected_types.add(ProjectType.GRADLE_JAVA)
        except UnicodeDecodeError as e:
            logging.warning(f"Failed to analyze build.gradle: {e}")
    
    def _analyze_requirements_txt(self, fpath: Path):
        """Analyze requirements.txt for project type hints."""
        try:
            content = fpath.read_text(encoding='utf-8').lower()
            if 'django' in content:
                self.detected_types.add(ProjectType.DJANGO)
            self.detected_types.add(ProjectType.PYTHON_APP)
        except UnicodeDecodeError as e:
            logging.warning(f"Failed to analyze requirements.txt: {e}")
