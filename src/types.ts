// ── Workspaces ───────────────────────────────────────────────────────────────

export interface Workspace {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
}

// ── Query ─────────────────────────────────────────────────────────────────────

export interface QueryParams {
    prompt: string;
    workspaceId?: string;
    conversationId?: string;
}

export interface QueryResponse {
    answer: string;
    conversationId?: string;
}

export type StreamChunkType = 'status' | 'content' | 'tool_call' | 'done' | 'error';

export interface StreamChunk {
    type: StreamChunkType;
    content?: string;
    status?: string;
    tool?: string;
    error?: string;
}

// ── Conversations ─────────────────────────────────────────────────────────────

export interface Conversation {
    id: string;
    workspaceId: string;
    title?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
}

export interface ConversationDetail extends Conversation {
    messages: ConversationMessage[];
}

export interface ListConversationsParams {
    workspaceId: string;
    limit?: number;
    before?: string;
}

// ── Tools ─────────────────────────────────────────────────────────────────────

export interface Tool {
    id: string;
    name: string;
    description: string;
    category?: string;
    parameters?: Record<string, unknown>;
}

export interface RunToolParams {
    toolId: string;
    workspaceId?: string;
    input: Record<string, unknown>;
}

// ── Files ─────────────────────────────────────────────────────────────────────

export interface FileMetadata {
    key: string;
    name: string;
    size: number;
    contentType?: string;
    fileId?: string;
    createdAt?: string;
}

export interface ListFilesParams {
    workspaceId: string;
    prefix?: string;
    limit?: number;
    after?: string;
}

export interface UploadFileParams {
    workspaceId: string;
    path?: string;
    description?: string;
}

export interface DownloadParams {
    workspaceId: string;
    key: string;
}

export interface PresignedUploadParams {
    workspaceId: string;
    filename: string;
    contentType: string;
    size: number;
    path?: string;
}

export interface PresignedUploadResult {
    uploadUrl: string;
    fileKey: string;
    expiresIn: number;
}

// ── Pipelines ─────────────────────────────────────────────────────────────────

export type PipelineStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Pipeline {
    id: string;
    status: PipelineStatus;
    progressPct?: number;
    currentStep?: string;
    outputPaths?: string[];
    logsPath?: string;
    createdAt: string;
    updatedAt?: string;
    error?: string;
}

export interface CreatePipelineParams {
    pipelineId?: string;
    toolId?: string;
    workspaceId: string;
    input: Record<string, unknown>;
}

export interface ListPipelinesParams {
    workspaceId: string;
    status?: PipelineStatus;
    limit?: number;
}

export interface WaitOptions {
    pollInterval?: number;
    onProgress?: (pipeline: Pipeline) => void;
}

// ── Visualizations ────────────────────────────────────────────────────────────

export interface ViewerUrlParams {
    filePath: string;
    workspaceId: string;
    expiresIn?: number;
}

export interface ViewerUrlResult {
    viewerUrl: string;
    format: string;
    expiresIn: number;
    expiresAt: string;
}

export type RenderType = 'volcano_plot' | 'manhattan_plot' | 'pca_plot' | 'heatmap' | 'coverage_track' | 'structure_3d' | 'pathway_map';
export type OutputFormat = 'png' | 'svg' | 'html';

export interface RenderParams {
    type: RenderType;
    filePath: string;
    workspaceId: string;
    options?: Record<string, unknown>;
    outputFormat?: OutputFormat;
    outputPath?: string;
}

export interface RenderJob {
    jobId: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    outputPath?: string;
    previewUrl?: string;
}

// ── Client config ─────────────────────────────────────────────────────────────

export interface SmartsBioConfig {
    apiKey?: string;
    baseUrl?: string;
    timeout?: number;
    maxRetries?: number;
}
