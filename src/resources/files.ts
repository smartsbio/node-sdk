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
        const json = await res.json() as { data: FileMetadata[] } | FileMetadata[];
        return Array.isArray(json) ? json : (json as { data: FileMetadata[] }).data;
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

        if (typeof file === 'string') {
            const { stat } = await import('fs/promises');
            const { basename } = await import('path');
            size = (await stat(file)).size;
            filename = basename(file);
        } else if (file instanceof Blob) {
            size = file.size;
            filename = (file as File).name ?? 'upload';
        } else {
            size = file.byteLength;
            filename = 'upload';
        }

        const contentType = guessContentType(filename);

        if (size > DIRECT_UPLOAD_LIMIT) {
            // --- Presigned S3 flow: file data never buffers through the gateway ---
            const presigned = await this.getUploadUrl({
                workspaceId: params.workspaceId,
                filename,
                contentType,
                size,
                path: params.path,
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
        if (params.path) form.append('path', params.path);
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
