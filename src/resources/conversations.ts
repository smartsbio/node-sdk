import { Conversation, ConversationDetail, ListConversationsParams } from '../types';

export class ConversationsResource {
    constructor(private readonly fetch: (path: string, init?: RequestInit) => Promise<Response>) {}

    async list(params: ListConversationsParams): Promise<Conversation[]> {
        const query = new URLSearchParams({ workspace_id: params.workspaceId });
        if (params.limit !== undefined) query.set('limit', String(params.limit));
        if (params.before) query.set('before', params.before);

        const res = await this.fetch(`/v1/conversations?${query}`);
        const json = await res.json() as { data: Conversation[] };
        return json.data ?? json;
    }

    async get(id: string, workspaceId: string): Promise<ConversationDetail> {
        const query = new URLSearchParams({ workspace_id: workspaceId });
        const res = await this.fetch(`/v1/conversations/${id}?${query}`);
        return res.json() as Promise<ConversationDetail>;
    }
}
