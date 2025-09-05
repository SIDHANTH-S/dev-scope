#!/usr/bin/env python3
"""
Test to verify that edges are being created properly.
"""

import os
import sys
import tempfile
from pathlib import Path

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_edge_creation():
    """Test that edges are created from plugin symbols."""
    try:
        from analyzer import CodebaseAnalyzer
        
        # Create a test project with imports
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "test_project"
            project_path.mkdir()
            
            # Create package.json
            (project_path / "package.json").write_text('''{
  "name": "test-project",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.0.0"
  }
}''')
            
            # Create src directory
            src_dir = project_path / "src"
            src_dir.mkdir()
            
            # Create main.tsx with import
            (src_dir / "main.tsx").write_text('''import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

function main() {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
}

main();''')
            
            # Create App.tsx with JSX component usage
            (src_dir / "App.tsx").write_text('''import React from 'react';

function App() {
  return (
    <div className="App">
      <h1>Hello World</h1>
      <CustomComponent />
    </div>
  );
}

function CustomComponent() {
  return <div>Custom</div>;
}

export default App;''')
            
            # Test analyzer
            analyzer = CodebaseAnalyzer()
            result = analyzer.analyze(str(project_path))
            
            print(f"✓ Analyzer completed")
            print(f"  - Total nodes: {result['graph']['metadata']['total_nodes']}")
            print(f"  - Total edges: {result['graph']['metadata']['total_edges']}")
            print(f"  - Node types: {result['graph']['metadata']['node_types']}")
            print(f"  - Edge types: {result['graph']['metadata']['edge_types']}")
            
            # Show some edges
            if result['graph']['edges']:
                print("\n=== Sample Edges ===")
                for edge in result['graph']['edges'][:5]:
                    print(f"  - {edge['source']} -> {edge['target']} ({edge['type']})")
            else:
                print("\n✗ No edges found!")
                
            # Check if we have the expected edge types
            edge_types = result['graph']['metadata']['edge_types']
            if 'depends_on' in edge_types or 'renders' in edge_types or 'calls' in edge_types:
                print("✓ Found expected edge types")
                return True
            else:
                print("✗ No expected edge types found")
                return False
                
    except Exception as e:
        print(f"✗ Edge creation test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_plugin_symbols():
    """Test that plugins are returning the correct symbols."""
    try:
        from analyzer.plugins.languages.javascript_plugin import JavaScriptPlugin
        
        # Create a temporary directory for testing
        with tempfile.TemporaryDirectory() as temp_dir:
            plugin = JavaScriptPlugin(temp_dir)
            
            # Create a test file with imports and JSX
            test_file = Path(temp_dir) / "test.tsx"
            test_file.write_text('''import React from 'react';
import { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <h1>Counter: {count}</h1>
      <Button onClick={() => setCount(count + 1)} />
    </div>
  );
}

function Button({ onClick }) {
  return <button onClick={onClick}>Click me</button>;
}

export default App;''')
            
            # Test the parse method
            nodes, symbols = plugin.parse(test_file, test_file.read_text(), False)
            
            print(f"✓ Plugin returned {len(nodes)} nodes")
            print(f"✓ Symbols: {list(symbols.keys())}")
            print(f"✓ Imports: {symbols.get('imports', [])}")
            print(f"✓ JSX components: {symbols.get('jsx_components', [])}")
            print(f"✓ Declared: {symbols.get('declared', [])}")
            
            # Check that we have the expected symbols
            if 'imports' in symbols and 'jsx_components' in symbols:
                print("✓ Plugin is returning the correct symbols")
                return True
            else:
                print("✗ Plugin is not returning the expected symbols")
                return False
                
    except Exception as e:
        print(f"✗ Plugin symbols test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all tests."""
    print("Testing edge creation...")
    
    tests = [
        test_plugin_symbols,
        test_edge_creation
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
        print()
    
    print(f"Tests passed: {passed}/{total}")
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
