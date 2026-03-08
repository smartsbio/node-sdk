import { Tool, RunToolParams } from '../types';

export class ToolsResource {
    constructor(private readonly fetch: (path: string, init?: RequestInit) => Promise<Response>) {}

    async list(): Promise<Tool[]> {
        const res = await this.fetch('/v1/tools');
        const json = await res.json() as { tools: Tool[] } | Tool[];
        return Array.isArray(json) ? json : (json as { tools: Tool[] }).tools;
    }

    async run(params: RunToolParams): Promise<unknown> {
        const res = await this.fetch(`/v1/tools/${params.toolId}/run`, {
            method: 'POST',
            body: JSON.stringify({
                workspace_id: params.workspaceId,
                input: params.input,
            }),
        });
        // Agent returns { status: 'success', result: <tool output> } — unwrap for callers
        const json = await res.json() as any;
        return json.result ?? json;
    }
}
