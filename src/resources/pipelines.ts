import { Pipeline, CreatePipelineParams, ListPipelinesParams, WaitOptions } from '../types';
import { APIError } from '../errors';

export class PipelinesResource {
    constructor(private readonly fetch: (path: string, init?: RequestInit) => Promise<Response>) {}

    async create(params: CreatePipelineParams): Promise<Pipeline> {
        const res = await this.fetch('/v1/pipelines', {
            method: 'POST',
            body: JSON.stringify({
                pipeline_id: params.pipelineId,
                tool_id: params.toolId,
                workspace_id: params.workspaceId,
                input: params.input,
            }),
        });
        return res.json() as Promise<Pipeline>;
    }

    async list(params: ListPipelinesParams): Promise<Pipeline[]> {
        const query = new URLSearchParams({ workspace_id: params.workspaceId });
        if (params.status) query.set('status', params.status);
        if (params.limit !== undefined) query.set('limit', String(params.limit));

        const res = await this.fetch(`/v1/pipelines?${query}`);
        const json = await res.json() as { data: Pipeline[] } | Pipeline[];
        return Array.isArray(json) ? json : (json as { data: Pipeline[] }).data;
    }

    async get(id: string, workspaceId: string): Promise<Pipeline> {
        const query = new URLSearchParams({ workspace_id: workspaceId });
        const res = await this.fetch(`/v1/pipelines/${id}?${query}`);
        return res.json() as Promise<Pipeline>;
    }

    async cancel(id: string, workspaceId: string): Promise<void> {
        const query = new URLSearchParams({ workspace_id: workspaceId });
        await this.fetch(`/v1/pipelines/${id}?${query}`, { method: 'DELETE' });
    }

    async wait(id: string, workspaceId: string, options: WaitOptions = {}): Promise<Pipeline> {
        const { pollInterval = 10_000, onProgress } = options;
        const terminal = new Set(['completed', 'failed', 'cancelled']);

        while (true) {
            const pipeline = await this.get(id, workspaceId);
            if (onProgress) onProgress(pipeline);
            if (terminal.has(pipeline.status)) {
                if (pipeline.status === 'failed') {
                    throw new APIError(500, 'pipeline_failed', pipeline.error ?? 'Pipeline failed');
                }
                return pipeline;
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
    }
}
