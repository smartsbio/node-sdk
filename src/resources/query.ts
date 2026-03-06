import { QueryParams, QueryResponse, StreamChunk } from '../types';
import { parseSSEStream } from '../streaming';

export class QueryResource {
    constructor(private readonly fetch: (path: string, init?: RequestInit) => Promise<Response>) {}

    async run(params: QueryParams): Promise<QueryResponse> {
        const res = await this.fetch('/v1/query', {
            method: 'POST',
            body: JSON.stringify({
                prompt: params.prompt,
                workspace_id: params.workspaceId,
                conversation_id: params.conversationId,
            }),
        });
        const data = await res.json() as Record<string, unknown>;
        return {
            answer: (data.result ?? data.answer ?? '') as string,
            conversationId: (data.sessionId ?? data.conversationId ?? data.conversation_id) as string | undefined,
        };
    }

    async *stream(params: QueryParams): AsyncGenerator<StreamChunk> {
        const res = await this.fetch('/v1/query/stream', {
            method: 'POST',
            headers: { 'Accept': 'text/event-stream' },
            body: JSON.stringify({
                prompt: params.prompt,
                workspace_id: params.workspaceId,
                conversation_id: params.conversationId,
            }),
        });

        if (!res.body) throw new Error('No response body for streaming request');
        yield* parseSSEStream(res.body);
    }
}
