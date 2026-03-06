import { SmartsBioConfig } from './types';
import { APIError, AuthenticationError, PermissionDeniedError, RateLimitError, WorkspaceAccessDeniedError } from './errors';
import { WorkspacesResource } from './resources/workspaces';
import { QueryResource } from './resources/query';
import { ConversationsResource } from './resources/conversations';
import { ToolsResource } from './resources/tools';
import { FilesResource } from './resources/files';
import { PipelinesResource } from './resources/pipelines';
import { VisualizationsResource } from './resources/visualizations';

const DEFAULT_BASE_URL = 'https://api.smarts.bio';
const DEFAULT_TIMEOUT = 120_000;
const DEFAULT_MAX_RETRIES = 3;

export class SmartsBio {
    readonly workspaces: WorkspacesResource;
    readonly query: QueryResource;
    readonly conversations: ConversationsResource;
    readonly tools: ToolsResource;
    readonly files: FilesResource;
    readonly pipelines: PipelinesResource;
    readonly visualizations: VisualizationsResource;

    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly timeout: number;
    private readonly maxRetries: number;

    constructor(config: SmartsBioConfig = {}) {
        const apiKey = config.apiKey ?? process.env['SMARTSBIO_API_KEY'];
        if (!apiKey) {
            throw new Error(
                'API key is required. Pass { apiKey } to SmartsBio() or set the SMARTSBIO_API_KEY environment variable.'
            );
        }
        this.apiKey = apiKey;
        this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
        this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
        this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

        const boundFetch = this._fetch.bind(this);
        this.workspaces = new WorkspacesResource(boundFetch);
        this.query = new QueryResource(boundFetch);
        this.conversations = new ConversationsResource(boundFetch);
        this.tools = new ToolsResource(boundFetch);
        this.files = new FilesResource(boundFetch);
        this.pipelines = new PipelinesResource(boundFetch);
        this.visualizations = new VisualizationsResource(boundFetch);
    }

    private async _fetch(path: string, init: RequestInit = {}): Promise<Response> {
        const url = `${this.baseUrl}${path}`;
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${this.apiKey}`,
            ...(init.headers as Record<string, string> ?? {}),
        };

        // Only set Content-Type for JSON bodies (not FormData)
        if (init.body && typeof init.body === 'string' && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        let lastError: Error | undefined;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.timeout);

            try {
                const res = await fetch(url, {
                    ...init,
                    headers,
                    signal: controller.signal,
                });
                clearTimeout(timer);

                if (res.ok) return res;

                // Don't retry on 4xx except 429
                if (res.status !== 429 && res.status >= 400 && res.status < 500) {
                    await this._throwError(res);
                }

                // For 429 / 5xx, retry after backoff
                if (attempt < this.maxRetries) {
                    const retryAfter = Number(res.headers.get('retry-after') ?? 0);
                    await sleep(retryAfter ? retryAfter * 1000 : Math.pow(2, attempt) * 500);
                    continue;
                }

                await this._throwError(res);
            } catch (err) {
                clearTimeout(timer);
                if (err instanceof APIError) throw err;
                lastError = err as Error;
                if (attempt < this.maxRetries) {
                    await sleep(Math.pow(2, attempt) * 500);
                }
            }
        }
        throw lastError ?? new Error('Request failed after retries');
    }

    private async _throwError(res: Response): Promise<never> {
        let body: { error?: string; message?: string } = {};
        try { body = await res.json(); } catch { /* ignore */ }

        const msg = body.message ?? res.statusText;
        const code = body.error ?? 'unknown_error';

        if (res.status === 401) throw new AuthenticationError(msg);
        if (res.status === 403) {
            if (code === 'workspace_access_denied') throw new WorkspaceAccessDeniedError(msg);
            throw new PermissionDeniedError(msg);
        }
        if (res.status === 429) {
            const retryAfter = Number(res.headers.get('retry-after') ?? undefined);
            throw new RateLimitError(msg, retryAfter || undefined);
        }
        throw new APIError(res.status, code, msg);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
