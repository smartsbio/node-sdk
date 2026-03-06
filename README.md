# @smartsbio/sdk

Official TypeScript/JavaScript SDK for the [smarts.bio](https://smarts.bio) bioinformatics platform.

## Installation

```bash
npm install @smartsbio/sdk
```

**Requirements:** Node.js 18+. Zero runtime dependencies — uses native `fetch` and `ReadableStream`.

## Quick Start

```typescript
import { SmartsBio } from '@smartsbio/sdk';

const client = new SmartsBio({ apiKey: process.env.SMARTSBIO_API_KEY });

// List workspaces
const workspaces = await client.workspaces.list();

// Run a query
const response = await client.query.run({
    prompt: 'Find BRCA1 variants associated with breast cancer',
    workspaceId: workspaces[0].id,
});
console.log(response.answer);
```

## Authentication

Generate an API key from [chat.smarts.bio](https://chat.smarts.bio) → Organization Settings → API Keys.

```typescript
// Pass directly
const client = new SmartsBio({ apiKey: 'sk_live_...' });

// Or set environment variable SMARTSBIO_API_KEY
const client = new SmartsBio();
```

## Configuration

```typescript
const client = new SmartsBio({
    apiKey: 'sk_live_...',
    baseUrl: 'https://api.smarts.bio',  // override for local dev: 'http://localhost:3022'
    timeout: 120_000,                   // ms (default: 120s)
    maxRetries: 3,                      // retries on 429 / 5xx (default: 3)
});
```

## Modules

### `client.workspaces`

```typescript
const workspaces = await client.workspaces.list();
// [{ id, name, description, createdAt }]
```

### `client.query`

```typescript
// Synchronous
const response = await client.query.run({ prompt: '...', workspaceId: '...' });

// Streaming (Server-Sent Events)
for await (const chunk of client.query.stream({ prompt: '...', workspaceId: '...' })) {
    if (chunk.type === 'status')  console.log(`[${chunk.status}]`);
    if (chunk.type === 'content') process.stdout.write(chunk.content ?? '');
    if (chunk.type === 'done')    console.log('\nComplete.');
}
```

### `client.conversations`

```typescript
const list = await client.conversations.list({ workspaceId: '...', limit: 20 });
const detail = await client.conversations.get(id, workspaceId);
```

### `client.tools`

```typescript
const tools = await client.tools.list();
const result = await client.tools.run({
    toolId: 'ncbi_search',
    workspaceId: '...',
    input: { database: 'pubmed', query: 'BRCA1', maxResults: 5 },
});
```

### `client.files`

```typescript
// List
const files = await client.files.list({ workspaceId: '...' });

// Upload (accepts file path, Buffer, or Blob)
const uploaded = await client.files.upload('./sample.vcf', { workspaceId: '...' });

// Download URL
const url = await client.files.getDownloadUrl({ workspaceId: '...', key: uploaded.key });

// Delete
await client.files.delete({ workspaceId: '...', key: uploaded.key });

// Presigned S3 upload (for large files)
const { uploadUrl, fileKey } = await client.files.getUploadUrl({
    workspaceId: '...', filename: 'large.bam', contentType: 'application/octet-stream', size: 1_000_000_000,
});
// PUT file directly to uploadUrl, then:
await client.files.confirmUpload({ workspaceId: '...', fileKey, filename: 'large.bam', size: 1_000_000_000, contentType: 'application/octet-stream' });
```

### `client.pipelines`

```typescript
// Create
const pipeline = await client.pipelines.create({
    pipelineId: 'alignment-wes',
    workspaceId: '...',
    input: { fastq_r1: 'orgs/.../r1.fastq.gz', fastq_r2: 'orgs/.../r2.fastq.gz', reference: 'GRCh38' },
});

// List / get / cancel
const all = await client.pipelines.list({ workspaceId: '...' });
const status = await client.pipelines.get(pipeline.id, workspaceId);
await client.pipelines.cancel(pipeline.id, workspaceId);

// Wait for completion (polls automatically)
const result = await client.pipelines.wait(pipeline.id, workspaceId, {
    pollInterval: 15_000,
    onProgress: p => console.log(`  ${p.progressPct}% — ${p.currentStep}`),
});
```

### `client.visualizations`

```typescript
// Generate a shareable viewer URL
const { viewerUrl, format } = await client.visualizations.viewerUrl({
    filePath: 'orgs/.../variants.vcf',
    workspaceId: '...',
    expiresIn: 3600,
});
console.log(`Open in browser: ${viewerUrl}`);

// Submit async render job (volcano plot, heatmap, PCA, etc.)
const job = await client.visualizations.render({
    type: 'volcano_plot',
    filePath: 'orgs/.../deseq2_results.csv',
    workspaceId: '...',
    outputFormat: 'png',
});
const done = await client.visualizations.getRenderStatus(job.jobId);
```

## Error Handling

```typescript
import { AuthenticationError, PermissionDeniedError, RateLimitError, APIError } from '@smartsbio/sdk';

try {
    await client.query.run({ prompt: '...' });
} catch (err) {
    if (err instanceof AuthenticationError) {
        console.error('Invalid API key');
    } else if (err instanceof PermissionDeniedError) {
        console.error('Key lacks required scope');
    } else if (err instanceof RateLimitError) {
        console.error(`Rate limited — retry after ${err.retryAfter}s`);
    } else if (err instanceof APIError) {
        console.error(`API error ${err.status}: ${err.message}`);
    }
}
```

## Examples

See the [`examples/`](./examples) directory for runnable scripts:

- [`query-sync.ts`](./examples/query-sync.ts) — basic query
- [`query-stream.ts`](./examples/query-stream.ts) — real-time streaming
- [`list-tools.ts`](./examples/list-tools.ts) — enumerate available tools
- [`upload-and-run.ts`](./examples/upload-and-run.ts) — upload file + run pipeline
- [`viewer-url.ts`](./examples/viewer-url.ts) — generate bio-viewer link

## Full Documentation

[smarts.bio/docs](https://smarts.bio/docs)
