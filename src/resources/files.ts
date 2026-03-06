import { FileMetadata, ListFilesParams, UploadFileParams, DownloadParams, PresignedUploadParams, PresignedUploadResult } from '../types';

export class FilesResource {
    constructor(private readonly fetch: (path: string, init?: RequestInit) => Promise<Response>) {}

    async list(params: ListFilesParams): Promise<FileMetadata[]> {
        const query = new URLSearchParams({ workspace_id: params.workspaceId });
        if (params.prefix) query.set('prefix', params.prefix);
        if (params.limit !== undefined) query.set('limit', String(params.limit));
        if (params.after) query.set('after', params.after);

        const res = await this.fetch(`/v1/files?${query}`);
        const json = await res.json() as { data: FileMetadata[] } | FileMetadata[];
        return Array.isArray(json) ? json : (json as { data: FileMetadata[] }).data;
    }

    /**
     * Upload a file to the workspace.
     * @param file - File path (Node.js), Buffer, or Blob
     * @param params - Upload parameters
     */
    async upload(
        file: string | Buffer | Blob,
        params: UploadFileParams
    ): Promise<FileMetadata> {
        const form = new FormData();
        form.append('workspace_id', params.workspaceId);
        if (params.path) form.append('path', params.path);
        if (params.description) form.append('description', params.description);

        if (typeof file === 'string') {
            // Node.js file path — read via dynamic import to avoid browser compat issues
            const { readFile } = await import('fs/promises');
            const { basename } = await import('path');
            const data = await readFile(file);
            form.append('file', new Blob([data]), basename(file));
        } else if (file instanceof Blob) {
            form.append('file', file);
        } else {
            // Buffer
            // Convert Buffer to Uint8Array to satisfy DOM Blob typing
            form.append('file', new Blob([new Uint8Array(file)]));
        }

        const res = await this.fetch('/v1/files/upload', {
            method: 'POST',
            body: form as unknown as BodyInit,
        });
        return res.json() as Promise<FileMetadata>;
    }

    async getDownloadUrl(params: DownloadParams): Promise<string> {
        const query = new URLSearchParams({ workspace_id: params.workspaceId, key: params.key });
        const res = await this.fetch(`/v1/files/download?${query}`);
        const json = await res.json() as { url: string; downloadUrl?: string };
        return json.url ?? json.downloadUrl ?? '';
    }

    async delete(params: DownloadParams): Promise<void> {
        const query = new URLSearchParams({ workspace_id: params.workspaceId, key: params.key });
        await this.fetch(`/v1/files?${query}`, { method: 'DELETE' });
    }

    async getUploadUrl(params: PresignedUploadParams): Promise<PresignedUploadResult> {
        const res = await this.fetch('/v1/files/upload-url', {
            method: 'POST',
            body: JSON.stringify({
                workspace_id: params.workspaceId,
                filename: params.filename,
                contentType: params.contentType,
                size: params.size,
                path: params.path,
            }),
        });
        return res.json() as Promise<PresignedUploadResult>;
    }

    async confirmUpload(params: {
        workspaceId: string;
        fileKey: string;
        filename: string;
        size: number;
        contentType: string;
    }): Promise<FileMetadata> {
        const res = await this.fetch('/v1/files/upload-confirm', {
            method: 'POST',
            body: JSON.stringify({
                workspace_id: params.workspaceId,
                fileKey: params.fileKey,
                filename: params.filename,
                size: params.size,
                contentType: params.contentType,
            }),
        });
        return res.json() as Promise<FileMetadata>;
    }
}
