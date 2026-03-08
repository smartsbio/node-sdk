import { Pipeline, CreatePipelineParams, ListPipelinesParams, WaitOptions } from '../types';
import { APIError } from '../errors';

export class PipelinesResource {
    constructor(private readonly fetch: (path: string, init?: RequestInit) => Promise<Response>) {}

    async create(params: CreatePipelineParams): Promise<Pipeline> {
        const res = await this.fetch('/v1/pipelines', {
            method: 'POST',
            body: JSON.stringify({
                // Gateway requires tool_id; pipelineId is an alias
                tool_id: params.toolId ?? params.pipelineId,
                workspace_id: params.workspaceId,
                input: params.input,
            }),
        });
        const json = await res.json() as any;
        // Process-manager returns { processId, executionId, status, message }
        return {
            id: json.processId ?? json.id ?? json._id,
            status: json.status ?? 'queued',
            progressPct: json.progressPct ?? json.progress,
            currentStep: json.currentStep,
            outputPaths: json.outputPaths,
            logsPath: json.logsPath,
            createdAt: json.createdAt ?? new Date().toISOString(),
            updatedAt: json.updatedAt,
            error: json.error,
        } as Pipeline;
    }

    async list(params: ListPipelinesParams): Promise<Pipeline[]> {
        const query = new URLSearchParams({ workspace_id: params.workspaceId });
        if (params.status) query.set('status', params.status);
        if (params.limit !== undefined) query.set('limit', String(params.limit));

        const res = await this.fetch(`/v1/pipelines?${query}`);
        const json = await res.json() as any;

        // Process-manager returns { processes: [...], pagination } or { data: [...] } or plain array
        const raw: any[] = Array.isArray(json)
            ? json
            : (json.processes ?? json.data ?? []);

        // Normalize to SDK Pipeline shape
        return raw.map((p: any) => ({
            id: p.id ?? p._id ?? p.processId,
            status: p.status,
            progressPct: p.progress ?? p.progressPct,
            currentStep: p.currentStep,
            outputPaths: p.outputPaths,
            logsPath: p.logsPath,
            createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : (p.createdAt ?? ''),
            updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
            error: p.error,
        })) as Pipeline[];
    }

    async get(id: string, workspaceId: string): Promise<Pipeline> {
        const query = new URLSearchParams({ workspace_id: workspaceId });
        const res = await this.fetch(`/v1/pipelines/${id}?${query}`);
        const json = await res.json() as any;
        // Process-manager GET /api/processes/:id returns { processRequest, execution }
        // Normalise to flat Pipeline shape
        const req = json.processRequest ?? json;
        const exec = json.execution;
        const createdAt = req.createdAt ?? json.createdAt;
        return {
            id: req.id ?? req._id ?? req.processId ?? json.id ?? json._id ?? json.processId,
            status: exec?.status ?? req.status ?? json.status ?? 'queued',
            progressPct: exec?.progressPct ?? exec?.progress ?? json.progressPct ?? json.progress,
            currentStep: exec?.currentStep ?? json.currentStep,
            outputPaths: exec?.outputPaths ?? json.outputPaths,
            logsPath: exec?.logsPath ?? json.logsPath,
            createdAt: createdAt instanceof Date ? createdAt.toISOString() : (createdAt ?? ''),
            updatedAt: exec?.updatedAt ?? req.updatedAt ?? json.updatedAt,
            error: exec?.error ?? json.error,
        } as Pipeline;
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
