import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FolderOpen, Code2, GitBranch, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import CodeflowVisualizer from '@/components/flow/CodeflowVisualizer';
import { analyzeCodebase, checkApiHealth, type CodebaseAnalysisResult } from '@/services/api';

const Index = () => {
  const [projectPath, setProjectPath] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<CodebaseAnalysisResult | null>(null);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const { toast } = useToast();

  React.useEffect(() => {
    checkApi();
  }, []);

  const checkApi = async () => {
    const isHealthy = await checkApiHealth();
    setApiStatus(isHealthy ? 'online' : 'offline');
  };

  const handleAnalyze = async () => {
    if (!projectPath.trim()) {
      toast({
        title: "Path Required",
        description: "Please enter a valid project path",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await analyzeCodebase(projectPath.trim());
      setAnalysisResult(result);
      toast({
        title: "Analysis Complete",
        description: `Found ${result.graph.metadata.total_nodes} nodes and ${result.graph.metadata.total_edges} relationships`,
      });
    } catch (error) {
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setAnalysisResult(null);
    setProjectPath('');
  };

  if (analysisResult) {
    return (
      <div className="h-screen flex flex-col">
        {/* Header */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="gap-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  New Analysis
                </Button>
                <div className="flex flex-col">
                  <h1 className="text-lg font-semibold">
                    {analysisResult.project_info.path.split('/').pop() || 'Project'}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {analysisResult.project_info.type} • {analysisResult.project_info.path}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {analysisResult.graph.metadata.total_nodes} nodes
                </Badge>
                <Badge variant="secondary">
                  {analysisResult.graph.metadata.total_edges} edges
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Visualization */}
        <div className="flex-1">
          <CodeflowVisualizer graphData={analysisResult.graph} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-background/80">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Code2 className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              DevScope
            </h1>
          </div>
          <p className="text-xl text-muted-foreground mb-2">
            Visualize Your Entire Codebase
          </p>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            Advanced codebase analysis and visualization tool that maps your project's architecture, 
            dependencies, and relationships using interactive flow diagrams.
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="text-center p-6 rounded-lg border bg-card/50 backdrop-blur-sm">
            <GitBranch className="w-8 h-8 text-accent mx-auto mb-3" />
            <h3 className="font-semibold mb-2">Dependency Mapping</h3>
            <p className="text-sm text-muted-foreground">
              Visualize complex relationships between modules, components, and services
            </p>
          </div>
          <div className="text-center p-6 rounded-lg border bg-card/50 backdrop-blur-sm">
            <Zap className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-2">Multi-Language Support</h3>
            <p className="text-sm text-muted-foreground">
              Supports React, Angular, Django, Spring Boot, and more frameworks
            </p>
          </div>
          <div className="text-center p-6 rounded-lg border bg-card/50 backdrop-blur-sm">
            <Code2 className="w-8 h-8 text-code-component mx-auto mb-3" />
            <h3 className="font-semibold mb-2">Interactive Visualization</h3>
            <p className="text-sm text-muted-foreground">
              Navigate, zoom, and explore your codebase with intuitive controls
            </p>
          </div>
        </div>

        {/* Analysis Form */}
        <Card className="max-w-2xl mx-auto border-2 border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center gap-2 justify-center">
              <FolderOpen className="w-5 h-5" />
              Analyze Project
            </CardTitle>
            <CardDescription>
              Enter the absolute path to your project directory to begin analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* API Status */}
            <div className="flex items-center justify-center gap-2 p-3 rounded-lg border bg-background/50">
              {apiStatus === 'checking' && (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Checking backend connection...</span>
                </>
              )}
              {apiStatus === 'online' && (
                <>
                  <CheckCircle2 className="w-4 h-4 text-accent" />
                  <span className="text-sm text-accent">Backend connected</span>
                </>
              )}
              {apiStatus === 'offline' && (
                <>
                  <AlertCircle className="w-4 h-4 text-destructive" />
                  <span className="text-sm text-destructive">Backend offline - Please start your Python server</span>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-path">Project Path</Label>
              <Input
                id="project-path"
                placeholder="/path/to/your/project"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isAnalyzing && handleAnalyze()}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Example: /Users/username/my-react-app or C:\Projects\my-app
              </p>
            </div>

            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || apiStatus !== 'online'}
              variant="analyze"
              size="lg"
              className="w-full"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Analyzing Codebase...
                </>
              ) : (
                <>
                  <Code2 className="w-4 h-4 mr-2" />
                  Analyze Codebase
                </>
              )}
            </Button>

            {apiStatus === 'offline' && (
              <div className="text-center p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive mb-2">Backend Server Required</p>
                <p className="text-xs text-muted-foreground">
                  Please ensure your Python backend is running on port 5000
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instructions */}
        <div className="mt-12 max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-center mb-6">Getting Started</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg">1. Start Backend Server</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-background/80 rounded-lg p-3 font-mono text-sm">
                  <div>cd /path/to/backend</div>
                  <div>pip install -r requirements.txt</div>
                  <div>python app.py</div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg">2. Enter Project Path</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Provide the absolute path to your project directory. The analyzer will 
                  automatically detect the project type and parse the codebase structure.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
