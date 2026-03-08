import { Conversation, ConversationDetail, ConversationMessage, ListConversationsParams } from '../types';

export class ConversationsResource {
    constructor(private readonly fetch: (path: string, init?: RequestInit) => Promise<Response>) {}

    async list(params: ListConversationsParams): Promise<Conversation[]> {
        const query = new URLSearchParams({ workspace_id: params.workspaceId });
        if (params.limit !== undefined) query.set('limit', String(params.limit));
        if (params.before) query.set('before', params.before);

        const res = await this.fetch(`/v1/conversations?${query}`);
        const json = await res.json() as any;
        // Agent returns { data: [...] }
        return (json.data ?? json) as Conversation[];
    }

    async get(id: string, workspaceId: string): Promise<ConversationDetail> {
        const query = new URLSearchParams({ workspace_id: workspaceId });
        const res = await this.fetch(`/v1/conversations/${id}?${query}`);
        const json = await res.json() as any;

        // Normalize from agent internal format to SDK ConversationDetail format.
        // Agent uses:  sessionId, messages[].type ('human'/'ai'), messages[].timestamp
        // SDK expects: id, messages[].role ('user'/'assistant'), messages[].createdAt
        const roleMap: Record<string, 'user' | 'assistant'> = {
            human: 'user',
            ai: 'assistant',
            agent: 'assistant',
            user: 'user',
            assistant: 'assistant',
        };

        const rawMessages: any[] = json.messages ?? [];
        const messages: ConversationMessage[] = rawMessages
            .filter((m: any) => roleMap[m.type ?? m.role])
            .map((m: any) => ({
                role: roleMap[m.type ?? m.role]!,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                createdAt: m.createdAt ?? m.timestamp ?? new Date().toISOString(),
            }));

        return {
            id: json.id ?? json.sessionId ?? id,
            workspaceId,
            title: json.title,
            createdAt: json.createdAt ?? json.timestamp ?? new Date().toISOString(),
            updatedAt: json.updatedAt ?? json.timestamp ?? new Date().toISOString(),
            messages,
        };
    }
}
