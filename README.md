<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/smartsbio/node-sdk/main/assets/logo-white.svg" />
    <img src="https://raw.githubusercontent.com/smartsbio/node-sdk/main/assets/logo.svg" alt="smarts.bio" height="60" />
  </picture>
</p>

<h3 align="center">Official TypeScript / JavaScript SDK for <a href="https://smarts.bio">smarts.bio</a></h3>

<p align="center">
  Run BLAST, GATK, AlphaFold, BWA, DESeq2, and dozens more bioinformatics tools — all through a single API.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@smartsbio/sdk"><img src="https://img.shields.io/npm/v/@smartsbio/sdk.svg" alt="npm version" /></a>
  <a href="https://smarts.bio/docs"><img src="https://img.shields.io/badge/docs-smarts.bio%2Fdocs-blue" alt="documentation" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license" /></a>
</p>

---

## Get started in 2 minutes

1. **Sign up** at [smarts.bio](https://smarts.bio) and create a free account
2. **Generate an API key** — Organization Settings → API Keys
3. **Install and run:**

```bash
npm install @smartsbio/sdk
```

```typescript
import { SmartsBio } from '@smartsbio/sdk';

const client = new SmartsBio({ apiKey: 'sk_live_...' });

const response = await client.query.run({
    prompt: 'Run BLAST for ATGCGTAACCGTAA and find homologs in nr database',
    workspaceId: 'ws_abc',
});
console.log(response.answer);
```

**Full documentation → [smarts.bio/docs](https://smarts.bio/docs)**

---

## What can you do?

Ask the AI agent anything — it orchestrates the right tools automatically:

| Category | Tools |
|----------|-------|
| **Sequence analysis** | BLAST, HMMER, Clustal Omega, MUSCLE |
| **Variant calling** | GATK HaplotypeCaller, FreeBayes, DeepVariant |
| **Alignment** | BWA-MEM, STAR, HISAT2, Bowtie2 |
| **Structure prediction** | AlphaFold, RoseTTAFold, ESMFold |
| **RNA-seq / expression** | DESeq2, edgeR, Salmon, kallisto |
| **Genome annotation** | Prokka, Augustus, BRAKER |
| **Literature & databases** | PubMed, NCBI Gene, UniProt, STRING, ClinVar |
| **Pipelines** | WES alignment, somatic variant calling, RNA-seq differential expression |

> These are just some of the tools available. See the full updated list at [smarts.bio/docs](https://smarts.bio/docs).


---

## Installation

```bash
npm install @smartsbio/sdk
# or
yarn add @smartsbio/sdk
# or
pnpm add @smartsbio/sdk
```

**Requirements:** Node.js 18+. Zero runtime dependencies — uses native `fetch` and `ReadableStream`.

---

## Authentication

```typescript
// Pass directly
const client = new SmartsBio({ apiKey: 'sk_live_...' });

// Or set SMARTSBIO_API_KEY environment variable
const client = new SmartsBio();
```

Generate your key at [chat.smarts.bio](https://chat.smarts.bio) → Organization Settings → API Keys.

---

## Examples

### Ask a bioinformatics question

```typescript
const response = await client.query.run({
    prompt: 'Find BRCA1 variants associated with breast cancer and summarize the evidence',
    workspaceId: 'ws_abc',
});
console.log(response.answer);
```

### Real-time streaming

```typescript
for await (const chunk of client.query.stream({ prompt: 'Align these reads to GRCh38', workspaceId: 'ws_abc' })) {
    if (chunk.type === 'status')  console.log(`[${chunk.status}]`);
    if (chunk.type === 'content') process.stdout.write(chunk.content ?? '');
    if (chunk.type === 'done')    console.log('\nDone.');
}
```

### Run a bioinformatics pipeline

```typescript
// Upload your FASTQ files
const r1 = await client.files.upload('./sample_R1.fastq.gz', { workspaceId: 'ws_abc' });
const r2 = await client.files.upload('./sample_R2.fastq.gz', { workspaceId: 'ws_abc' });

// Launch a WES alignment pipeline
const pipeline = await client.pipelines.create({
    pipelineId: 'alignment-wes',
    workspaceId: 'ws_abc',
    input: { fastq_r1: r1.key, fastq_r2: r2.key, reference: 'GRCh38' },
});

// Wait for results (polls automatically)
const result = await client.pipelines.wait(pipeline.id, 'ws_abc', {
    onProgress: p => console.log(`  ${p.progressPct}% — ${p.currentStep}`),
});
```

### Visualize results

```typescript
// Get a shareable link to the built-in VCF / BAM / PDB viewer
const { viewerUrl } = await client.visualizations.viewerUrl({
    filePath: 'orgs/.../variants.vcf',
    workspaceId: 'ws_abc',
});
console.log(`Open in browser: ${viewerUrl}`);
```

---

## SDK Modules

| Module | Description |
|--------|-------------|
| `client.query` | Ask the AI agent — sync or streaming SSE |
| `client.workspaces` | List and manage workspaces |
| `client.conversations` | Retrieve conversation history |
| `client.tools` | List available tools and run them directly |
| `client.files` | Upload, download, and manage files (supports large files via presigned S3) |
| `client.pipelines` | Launch and monitor long-running bioinformatics pipelines |
| `client.visualizations` | Generate shareable viewer URLs and render plots |

---

## Error Handling

```typescript
import { AuthenticationError, PermissionDeniedError, RateLimitError, APIError } from '@smartsbio/sdk';

try {
    await client.query.run({ prompt: '...' });
} catch (err) {
    if (err instanceof AuthenticationError)   console.error('Invalid API key');
    if (err instanceof PermissionDeniedError) console.error('Key lacks required scope');
    if (err instanceof RateLimitError)        console.error(`Rate limited — retry after ${err.retryAfter}s`);
    if (err instanceof APIError)              console.error(`API error ${err.status}: ${err.message}`);
}
```

---

## Configuration

```typescript
const client = new SmartsBio({
    apiKey: 'sk_live_...',
    baseUrl: 'https://api.smarts.bio', // override for local dev: 'http://localhost:3022'
    timeout: 120_000,                  // ms (default: 120s)
    maxRetries: 3,                     // retries on 429 / 5xx (default: 3)
});
```

---

## More Examples

See the [`examples/`](./examples) directory:

- [`query-sync.ts`](./examples/query-sync.ts) — basic AI query
- [`query-stream.ts`](./examples/query-stream.ts) — real-time streaming output
- [`list-tools.ts`](./examples/list-tools.ts) — enumerate available tools
- [`upload-and-run.ts`](./examples/upload-and-run.ts) — upload files and run a pipeline
- [`viewer-url.ts`](./examples/viewer-url.ts) — generate a bio-viewer link

---

## Documentation & Support

- **Full docs:** [smarts.bio/docs](https://smarts.bio/docs)
- **Platform:** [smarts.bio](https://smarts.bio)
- **Issues:** [GitHub Issues](https://github.com/smartsbio/node-sdk/issues)
- **Email:** support@smarts.bio

---

<p align="center">
  Built with ❤️ by the <a href="https://smarts.bio">smarts.bio</a> team
</p>
