import { Workspace } from '../types';

export class WorkspacesResource {
    constructor(private readonly fetch: (path: string, init?: RequestInit) => Promise<Response>) {}

    async list(): Promise<Workspace[]> {
        const res = await this.fetch('/v1/workspaces');
        const json = await res.json() as { data: Workspace[] };
        return json.data;
    }
}
