import { ViewerUrlParams, ViewerUrlResult, RenderParams, RenderJob } from '../types';

export class VisualizationsResource {
    constructor(private readonly fetch: (path: string, init?: RequestInit) => Promise<Response>) {}

    async viewerUrl(params: ViewerUrlParams): Promise<ViewerUrlResult> {
        const res = await this.fetch('/v1/visualizations/viewer-url', {
            method: 'POST',
            body: JSON.stringify({
                file_path: params.filePath,
                workspace_id: params.workspaceId,
                expires_in: params.expiresIn,
            }),
        });
        return res.json() as Promise<ViewerUrlResult>;
    }

    async render(params: RenderParams): Promise<RenderJob> {
        const res = await this.fetch('/v1/visualizations/render', {
            method: 'POST',
            body: JSON.stringify({
                type: params.type,
                file_key: params.filePath,
                workspace_id: params.workspaceId,
                options: params.options,
                output_format: params.outputFormat,
                output_path: params.outputPath,
            }),
        });
        return res.json() as Promise<RenderJob>;
    }

    async getRenderStatus(jobId: string): Promise<RenderJob> {
        const res = await this.fetch(`/v1/visualizations/${jobId}`);
        return res.json() as Promise<RenderJob>;
    }
}
