import { FileMetadata, ListFilesParams, UploadFileParams, DownloadParams, PresignedUploadParams, PresignedUploadResult } from '../types';

// Files above this threshold are uploaded via the presigned S3 flow so the
// API server never buffers the payload in memory.
const DIRECT_UPLOAD_LIMIT = 10 * 1024 * 1024; // 10 MB

function guessContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
        fastq: 'text/plain', fq: 'text/plain',
        fa: 'text/plain', fasta: 'text/plain',
        bam: 'application/octet-stream', cram: 'application/octet-stream',
        vcf: 'text/plain', bcf: 'application/octet-stream',
        gz: 'application/gzip', bz2: 'application/x-bzip2',
        tsv: 'text/tab-separated-values', csv: 'text/csv',
        json: 'application/json', txt: 'text/plain',
        pdf: 'application/pdf',
    };
    return map[ext] ?? 'application/octet-stream';
}

export class FilesResource {
    constructor(private readonly fetch: (path: string, init?: RequestInit) => Promise<Response>) {}

    async list(params: ListFilesParams): Promise<FileMetadata[]> {
        const query = new URLSearchParams({ workspace_id: params.workspaceId });
        if (params.prefix) query.set('prefix', params.prefix);
        if (params.limit !== undefined) query.set('limit', String(params.limit));
        if (params.after) query.set('after', params.after);

        const res = await this.fetch(`/v1/files?${query}`);
        // Backend returns { status, data: { files: [...], pagination: {...} } }
        // Handle all possible shapes defensively
        const json = await res.json() as any;
        if (Array.isArray(json)) return json as FileMetadata[];
        if (Array.isArray(json.data)) return json.data as FileMetadata[];
        if (json.data && Array.isArray(json.data.files)) return json.data.files as FileMetadata[];
        return [];
    }

    /**
     * Upload a file to the workspace.
     * Files ≤ 10 MB are sent directly to the gateway.
     * Larger files are routed through the presigned S3 flow automatically —
     * the file data never buffers through the API server.
     * @param file - File path (Node.js), Buffer, or Blob
     * @param params - Upload parameters
     */
    async upload(
        file: string | Buffer | Blob,
        params: UploadFileParams
    ): Promise<FileMetadata> {
        // --- Resolve metadata without reading the full file yet ---
        let size: number;
        let filename: string;
        // workspacePath is the directory within the workspace (not including filename)
        let workspacePath: string | undefined = params.path;

        if (typeof file === 'string') {
            const { stat } = await import('fs/promises');
            const { basename } = await import('path');
            size = (await stat(file)).size;
            filename = basename(file);
        } else if (file instanceof Blob) {
            size = file.size;
            filename = (file as File).name ?? 'upload';
        } else {
            // Buffer: derive filename from params.path last segment (e.g. "test/foo.fasta" → "foo.fasta")
            size = file.byteLength;
            if (params.path) {
                const segments = params.path.split('/');
                filename = segments[segments.length - 1] || 'upload';
                workspacePath = segments.slice(0, -1).join('/') || undefined;
            } else {
                filename = 'upload';
            }
        }

        const contentType = guessContentType(filename);

        if (size > DIRECT_UPLOAD_LIMIT) {
            // --- Presigned S3 flow: file data never buffers through the gateway ---
            const presigned = await this.getUploadUrl({
                workspaceId: params.workspaceId,
                filename,
                contentType,
                size,
                path: workspacePath,
            });

            let s3Body: BodyInit;
            if (typeof file === 'string') {
                const { readFile } = await import('fs/promises');
                s3Body = await readFile(file);
            } else {
                s3Body = file as unknown as BodyInit;
            }

            await fetch(presigned.uploadUrl, {
                method: 'PUT',
                body: s3Body,
                headers: { 'Content-Type': contentType },
            });

            return this.confirmUpload({
                workspaceId: params.workspaceId,
                fileKey: presigned.fileKey,
                filename,
                size,
                contentType,
            });
        }

        // --- Direct upload ≤ 10 MB ---
        const form = new FormData();
        form.append('workspace_id', params.workspaceId);
        if (workspacePath) form.append('path', workspacePath);
        if (params.description) form.append('description', params.description);

        if (typeof file === 'string') {
            const { readFile } = await import('fs/promises');
            const data = await readFile(file);
            form.append('file', new Blob([data]), filename);
        } else if (file instanceof Blob) {
            form.append('file', file, filename);
        } else {
            form.append('file', new Blob([new Uint8Array(file)]), filename);
        }

        const res = await this.fetch('/v1/files/upload', {
            method: 'POST',
            body: form as unknown as BodyInit,
        });
        // Backend returns { status: 'success', data: FileMetadata, message: '...' }
        const json = await res.json() as any;
        return (json.data ?? json) as FileMetadata;
    }

    async getDownloadUrl(params: DownloadParams): Promise<string> {
        const query = new URLSearchParams({ workspace_id: params.workspaceId, key: params.key });
        const res = await this.fetch(`/v1/files/download?${query}`);
        const json = await res.json() as any;
        // Backend returns { status, data: { downloadUrl, fileKey } }
        const inner = json.data ?? json;
        return inner.downloadUrl ?? inner.url ?? '';
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
        const json = await res.json() as any;
        // Backend returns { status, data: { uploadUrl, fileKey, ... } }
        return (json.data ?? json) as PresignedUploadResult;
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
        const json = await res.json() as any;
        // Backend returns { status, data: FileMetadata }
        return (json.data ?? json) as FileMetadata;
    }
}
