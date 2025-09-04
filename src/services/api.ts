import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000';

export interface CodebaseAnalysisResult {
  project_info: {
    path: string;
    type: string;
    config_files: Array<{
      path: string;
      type: string;
    }>;
    entry_points: Array<{
      type: string;
      value: string;
      source: string;
    }>;
  };
  graph: {
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

export const analyzeCodebase = async (folderPath: string): Promise<CodebaseAnalysisResult> => {
  try {
    // Step 1: submit job
    const { data: jobData } = await axios.post(`${API_BASE_URL}/parse`, {
      folder_path: folderPath,
    });

    const jobId = jobData.job_id;
    console.log("Job submitted:", jobId);

    // Step 2: poll until complete
    let statusData;
    while (true) {
      const { data } = await axios.get(`${API_BASE_URL}/status/${jobId}`);
      console.log("Job status:", data);

      if (data.status === "completed") {
        statusData = data.result;
        break;
      } else if (data.status === "failed") {
        throw new Error("Analysis failed");
      }
      await new Promise(res => setTimeout(res, 2000)); // wait before retry
    }

    return statusData;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.error || "Failed to analyze codebase");
    }
    throw new Error("Network error occurred");
  }
};

export const checkApiHealth = async (): Promise<boolean> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/health`);
    return response.data.status === 'healthy';
  } catch (error) {
    return false;
  }
};