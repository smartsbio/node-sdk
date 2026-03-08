#!/usr/bin/env npx tsx
/// <reference types="node" />
/**
 * E2E Test Suite — smarts.bio Node SDK
 *
 * Mirrors the docs pages at smarts.bio/docs and validates that every
 * documented code example works against the real API.
 *
 * Usage:
 *   SMARTSBIO_API_KEY=sk_live_... \
 *   SMARTSBIO_WORKSPACE_ID=ws_... \
 *   npx tsx scripts/test-e2e.ts
 *
 * Optional env flags:
 *   RUN_PIPELINE_TESTS=true   Run pipeline create/cancel tests (uses queue capacity)
 *   RUN_EXPENSIVE=true        Run GPU-backed tools (protein structure prediction)
 */

import { SmartsBio } from '../src/index';
import { AuthenticationError, APIError } from '../src/errors';
import { StreamChunk } from '../src/types';

// ─── Config ──────────────────────────────────────────────────────────────────

const API_KEY = process.env.SMARTSBIO_API_KEY ?? '';
const WORKSPACE_ID = process.env.SMARTSBIO_WORKSPACE_ID ?? '';
const BASE_URL = process.env.SMARTSBIO_BASE_URL;

const RUN_PIPELINE_TESTS = process.env.RUN_PIPELINE_TESTS === 'true';
const RUN_EXPENSIVE = process.env.RUN_EXPENSIVE === 'true';

// ─── Test runner ─────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;
let skipped = 0;
const failures: { section: string; test: string; error: unknown }[] = [];

function section(name: string) {
    console.log(`\n${BOLD}${BLUE}── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}${RESET}`);
}

async function test(name: string, fn: () => Promise<void>) {
    process.stdout.write(`  ${name} ... `);
    try {
        await fn();
        console.log(`${GREEN}✓${RESET}`);
        passed++;
    } catch (err) {
        console.log(`${RED}✗${RESET}`);
        console.log(`    ${RED}${err instanceof Error ? err.message : String(err)}${RESET}`);
        failed++;
        failures.push({ section: currentSection, test: name, error: err });
    }
}

function skip(name: string, reason: string) {
    console.log(`  ${DIM}${name} ... skipped (${reason})${RESET}`);
    skipped++;
}


function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(`Assertion failed: ${message}`);
}


let currentSection = '';
function setSection(name: string) { currentSection = name; section(name); }

// ─── Guard ────────────────────────────────────────────────────────────────────

if (!API_KEY) {
    console.error(`${RED}${BOLD}Error: SMARTSBIO_API_KEY is required${RESET}`);
    console.error('Usage: SMARTSBIO_API_KEY=sk_live_... SMARTSBIO_WORKSPACE_ID=ws_... npx tsx scripts/test-e2e.ts');
    process.exit(1);
}
if (!WORKSPACE_ID) {
    console.error(`${RED}${BOLD}Error: SMARTSBIO_WORKSPACE_ID is required${RESET}`);
    process.exit(1);
}

console.log(`${BOLD}smarts.bio SDK E2E Test Suite${RESET}`);
console.log(`${DIM}Base URL: ${BASE_URL ?? 'default (https://api.smarts.bio)'}${RESET}`);
console.log(`${DIM}Workspace: ${WORKSPACE_ID}${RESET}`);
console.log(`${DIM}Pipeline tests: ${RUN_PIPELINE_TESTS ? 'enabled' : 'disabled (set RUN_PIPELINE_TESTS=true)'}${RESET}`);
console.log(`${DIM}Expensive tests: ${RUN_EXPENSIVE ? 'enabled' : 'disabled (set RUN_EXPENSIVE=true)'}${RESET}`);

async function main() {

// ─── Clients ─────────────────────────────────────────────────────────────────

const clientOpts = BASE_URL ? { baseUrl: BASE_URL } : {};
const client = new SmartsBio({ apiKey: API_KEY, ...clientOpts });
const badClient = new SmartsBio({ apiKey: 'sk_live_INVALID_KEY_FOR_AUTH_TEST', ...clientOpts });

// Conversation IDs discovered during the run (reused across tests)
let conversationId: string | undefined;
let uploadedFileKey: string | undefined;
let pipelineId: string | undefined;

// ─── 1. Infrastructure ───────────────────────────────────────────────────────

setSection('Infrastructure');

await test('health endpoint responds', async () => {
    const baseUrl = BASE_URL ?? 'https://api.smarts.bio';
    const res = await fetch(`${baseUrl}/health`);
    assert(res.ok, `Expected 200, got ${res.status}`);
    const body = await res.json() as Record<string, unknown>;
    assert(typeof body === 'object' && body !== null, 'Expected JSON object');
});

await test('unauthenticated request returns 401', async () => {
    try {
        await badClient.query.run({ prompt: 'Hello', workspaceId: WORKSPACE_ID });
        throw new Error('Expected AuthenticationError but request succeeded');
    } catch (err) {
        if (err instanceof AuthenticationError) return; // ✓
        throw err;
    }
});

await test('error object has status and code', async () => {
    try {
        await badClient.query.run({ prompt: 'Hello', workspaceId: WORKSPACE_ID });
        throw new Error('Expected error');
    } catch (err) {
        if (err instanceof APIError) {
            assert(typeof err.status === 'number', 'status should be a number');
            assert(typeof err.code === 'string', 'code should be a string');
            return;
        }
        throw err;
    }
});

// ─── 2. Workspaces ───────────────────────────────────────────────────────────

setSection('Workspaces');

await test('list workspaces returns array', async () => {
    const workspaces = await client.workspaces.list();
    assert(Array.isArray(workspaces), 'Expected array');
    assert(workspaces.length > 0, 'Expected at least one workspace');
});

await test('workspace has required fields', async () => {
    const workspaces = await client.workspaces.list();
    const ws = workspaces[0];
    assert(typeof ws.id === 'string', 'id should be string');
    assert(typeof ws.name === 'string', 'name should be string');
    assert(typeof ws.createdAt === 'string', 'createdAt should be string');
});

await test('target workspace exists', async () => {
    const workspaces = await client.workspaces.list();
    const match = workspaces.find(w => w.id === WORKSPACE_ID);
    assert(match !== undefined, `Workspace ${WORKSPACE_ID} not found in workspace list`);
});

// ─── 3. Query — Getting Started ──────────────────────────────────────────────

setSection('Query — Getting Started');

await test('query.run returns answer and conversationId', async () => {
    const result = await client.query.run({
        prompt: 'What is CRISPR-Cas9? Answer in one sentence.',
        workspaceId: WORKSPACE_ID,
    });
    assert(typeof result.answer === 'string', 'answer should be string');
    assert(result.answer.length > 0, 'answer should not be empty');
    assert(typeof result.conversationId === 'string', 'conversationId should be string');
    conversationId = result.conversationId;
});

await test('query.run supports conversation continuation', async () => {
    assert(conversationId !== undefined, 'Need conversationId from previous test');
    const result = await client.query.run({
        prompt: 'What enzyme does it use?',
        workspaceId: WORKSPACE_ID,
        conversationId,
    });
    assert(typeof result.answer === 'string', 'answer should be string');
    assert(result.answer.length > 0, 'follow-up answer should not be empty');
});

await test('query.stream yields chunks', async () => {
    let totalChunks = 0;
    let hasContent = false;

    const chunks: StreamChunk[] = [];
    for await (const chunk of client.query.stream({
        prompt: 'Name one DNA repair mechanism.',
        workspaceId: WORKSPACE_ID,
    })) {
        assert(typeof chunk === 'object' && chunk !== null, 'Each chunk should be an object');
        chunks.push(chunk);
        totalChunks++;
        // The final chunk has status='complete' and carries the full answer in result
        if (chunk.status === 'complete' && typeof chunk.result === 'string' && chunk.result.length > 0) {
            hasContent = true;
        }
    }

    if (!hasContent) {
        console.log(`\n    ${DIM}[debug] received ${chunks.length} chunks:${RESET}`);
        for (const c of chunks) {
            console.log(`    ${DIM}${JSON.stringify(c).slice(0, 160)}${RESET}`);
        }
    }

    assert(totalChunks > 0, 'Expected at least one chunk from the stream');
    assert(hasContent, 'Expected a completion chunk with a non-empty result');
});

// ─── 4. Tools ────────────────────────────────────────────────────────────────

setSection('Tools');

let toolList: Awaited<ReturnType<typeof client.tools.list>> = [];

await test('tools.list returns non-empty array', async () => {
    toolList = await client.tools.list();
    assert(Array.isArray(toolList), 'Expected array');
    assert(toolList.length > 0, 'Expected at least one tool');
});

await test('each tool has id, name, description', async () => {
    for (const tool of toolList) {
        assert(typeof tool.id === 'string', `tool.id should be string, got ${typeof tool.id}`);
        assert(typeof tool.name === 'string', `tool.name should be string`);
        assert(typeof tool.description === 'string', `tool.description should be string`);
    }
});

await test('known tool ncbi_pubmed is in the catalog', async () => {
    const found = toolList.some(t => t.id === 'ncbi_pubmed' || t.id === 'ncbi-pubmed');
    assert(found, 'ncbi_pubmed not found in tools list');
});

await test('tools.run ncbi-pubmed — search PubMed', async () => {
    const result = await client.tools.run({
        toolId: 'ncbi-pubmed',
        workspaceId: WORKSPACE_ID,
        input: { query: 'BRCA1 breast cancer', max_results: 3 },
    }) as Record<string, unknown>;
    // Result is tool-specific — just verify it came back as an object
    assert(typeof result === 'object' && result !== null, 'Expected object result');
});

await test('tools.run list-pipelines — list available pipelines', async () => {
    const result = await client.tools.run({
        toolId: 'list-pipelines',
        workspaceId: WORKSPACE_ID,
        input: {},
    }) as Record<string, unknown>;
    assert(typeof result === 'object' && result !== null, 'Expected object result');
});

if (RUN_EXPENSIVE) {
    await test('tools.run protein_structure_prediction (expensive/GPU)', async () => {
        const result = await client.tools.run({
            toolId: 'protein-structure-prediction',
            workspaceId: WORKSPACE_ID,
            input: {
                sequence: 'MKTAYIAKQRQISFVKSHFSRQ',
            },
        }) as Record<string, unknown>;
        assert(typeof result === 'object' && result !== null, 'Expected object result');
    });
} else {
    skip('tools.run protein_structure_prediction (expensive/GPU)', 'RUN_EXPENSIVE not set');
}

// ─── 5. Files ────────────────────────────────────────────────────────────────

setSection('Files');

const TEST_FILENAME = `test-upload-${Date.now()}.fasta`;
const TEST_FASTA = Buffer.from(
    `>test_sequence\nATGCGTACGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGA\n`
);

await test('files.list returns array', async () => {
    const files = await client.files.list({ workspaceId: WORKSPACE_ID });
    assert(Array.isArray(files), 'Expected array');
});

await test('files.upload small file (direct, ≤10 MB)', async () => {
    const meta = await client.files.upload(TEST_FASTA, {
        workspaceId: WORKSPACE_ID,
        path: TEST_FILENAME,
        description: 'E2E test upload — safe to delete',
    });
    assert(typeof meta.key === 'string', 'key should be string');
    assert(meta.name === TEST_FILENAME || meta.key.includes(TEST_FILENAME), 'filename should match');
    uploadedFileKey = meta.key;
});

await test('files.list includes uploaded file', async () => {
    assert(uploadedFileKey !== undefined, 'Need uploadedFileKey from previous test');
    const files = await client.files.list({ workspaceId: WORKSPACE_ID });
    const found = files.some(f => f.key === uploadedFileKey);
    assert(found, `Uploaded file ${uploadedFileKey} not found in listing`);
});

await test('files.getDownloadUrl returns a URL', async () => {
    assert(uploadedFileKey !== undefined, 'Need uploadedFileKey from previous test');
    const url = await client.files.getDownloadUrl({
        workspaceId: WORKSPACE_ID,
        key: uploadedFileKey,
    });
    assert(typeof url === 'string' && url.startsWith('http'), `Expected HTTP URL, got: ${url}`);
});

if (RUN_PIPELINE_TESTS) {
    await test('files.upload large file (>10 MB, via presigned S3 flow)', async () => {
        // 11 MB of synthetic data — routed through S3, never buffers in API gateway
        const LARGE_FILENAME = `test-large-${Date.now()}.fastq`;
        const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'A');
        const meta = await client.files.upload(largeBuffer, {
            workspaceId: WORKSPACE_ID,
            path: `test/${LARGE_FILENAME}`,
            description: 'E2E large file test — safe to delete',
        });
        assert(typeof meta.key === 'string', 'key should be string');
        // Clean up immediately
        await client.files.delete({ workspaceId: WORKSPACE_ID, key: meta.key });
    });
} else {
    skip('files.upload large file (>10 MB, presigned S3)', 'RUN_PIPELINE_TESTS not set');
}

await test('files.delete removes the uploaded file', async () => {
    assert(uploadedFileKey !== undefined, 'Need uploadedFileKey from previous test');
    await client.files.delete({ workspaceId: WORKSPACE_ID, key: uploadedFileKey });
    // Verify it's gone
    const files = await client.files.list({ workspaceId: WORKSPACE_ID });
    const stillPresent = files.some(f => f.key === uploadedFileKey);
    assert(!stillPresent, 'File should be removed after delete');
});

// ─── 6. Conversations ────────────────────────────────────────────────────────

setSection('Conversations');

await test('conversations.list returns array', async () => {
    const convos = await client.conversations.list({ workspaceId: WORKSPACE_ID });
    assert(Array.isArray(convos), 'Expected array');
});

await test('conversations.list respects limit param', async () => {
    const convos = await client.conversations.list({ workspaceId: WORKSPACE_ID, limit: 2 });
    assert(Array.isArray(convos), 'Expected array');
    assert(convos.length <= 2, `Expected at most 2 conversations, got ${convos.length}`);
});

await test('conversations.get returns detail with messages', async () => {
    assert(conversationId !== undefined, 'Need conversationId from query tests');
    const detail = await client.conversations.get(conversationId, WORKSPACE_ID);
    assert(typeof detail.id === 'string', 'id should be string');
    assert(Array.isArray(detail.messages), 'messages should be array');
    assert(detail.messages.length >= 2, 'Should have at least user + assistant message');
    const roles = new Set(detail.messages.map(m => m.role));
    assert(roles.has('user'), 'Should have user messages');
    assert(roles.has('assistant'), 'Should have assistant messages');
});

await test('each message has role and content', async () => {
    assert(conversationId !== undefined, 'Need conversationId from query tests');
    const detail = await client.conversations.get(conversationId, WORKSPACE_ID);
    for (const msg of detail.messages) {
        assert(msg.role === 'user' || msg.role === 'assistant', `Unknown role: ${msg.role}`);
        assert(typeof msg.content === 'string', 'content should be string');
        assert(typeof msg.createdAt === 'string', 'createdAt should be string');
    }
});

// ─── 7. Pipelines ────────────────────────────────────────────────────────────

setSection('Pipelines');

await test('pipelines.list returns array', async () => {
    const pipelines = await client.pipelines.list({ workspaceId: WORKSPACE_ID });
    assert(Array.isArray(pipelines), 'Expected array');
});

await test('pipelines.list filters by status', async () => {
    const running = await client.pipelines.list({ workspaceId: WORKSPACE_ID, status: 'running' });
    assert(Array.isArray(running), 'Expected array');
    for (const p of running) {
        assert(p.status === 'running', `Expected status=running, got ${p.status}`);
    }
});

await test('each pipeline has required fields', async () => {
    const all = await client.pipelines.list({ workspaceId: WORKSPACE_ID, limit: 5 });
    for (const p of all) {
        assert(typeof p.id === 'string', 'id should be string');
        assert(typeof p.status === 'string', 'status should be string');
        assert(typeof p.createdAt === 'string', 'createdAt should be string');
    }
});

if (RUN_PIPELINE_TESTS) {
    await test('pipelines.create predefined quality-control pipeline', async () => {
        const pipeline = await client.pipelines.create({
            pipelineId: 'quality-control',
            workspaceId: WORKSPACE_ID,
            input: {
                // Minimal input — actual run will fail without real FASTQ but
                // create should succeed and return a queued pipeline
                input_files: [],
            },
        });
        assert(typeof pipeline.id === 'string', 'id should be string');
        assert(['queued', 'running'].includes(pipeline.status), `Unexpected status: ${pipeline.status}`);
        pipelineId = pipeline.id;
    });

    await test('pipelines.get returns pipeline by id', async () => {
        assert(pipelineId !== undefined, 'Need pipelineId from previous test');
        const pipeline = await client.pipelines.get(pipelineId, WORKSPACE_ID);
        assert(pipeline.id === pipelineId, 'id should match');
        assert(typeof pipeline.status === 'string', 'status should be string');
    });

    await test('pipelines.cancel stops the pipeline', async () => {
        assert(pipelineId !== undefined, 'Need pipelineId from previous test');
        await client.pipelines.cancel(pipelineId, WORKSPACE_ID);
        // Give a moment for cancellation to propagate
        await new Promise(r => setTimeout(r, 1000));
        const pipeline = await client.pipelines.get(pipelineId, WORKSPACE_ID);
        assert(
            ['cancelled', 'failed', 'completed'].includes(pipeline.status),
            `Expected cancelled status, got ${pipeline.status}`
        );
    });

    await test('pipelines.create custom composed pipeline (agent-driven)', async () => {
        // Use the agent to compose a custom analysis — submit via query
        const result = await client.query.run({
            prompt: 'Run a sequence length analysis on the string "ATGCATGCATGCATGC" and return the length.',
            workspaceId: WORKSPACE_ID,
        });
        assert(typeof result.answer === 'string', 'Expected answer');
        // The agent may start a pipeline internally — just verify a response came back
    });
} else {
    skip('pipelines.create predefined quality-control pipeline', 'RUN_PIPELINE_TESTS not set');
    skip('pipelines.get returns pipeline by id', 'RUN_PIPELINE_TESTS not set');
    skip('pipelines.cancel stops the pipeline', 'RUN_PIPELINE_TESTS not set');
    skip('pipelines.create custom composed pipeline', 'RUN_PIPELINE_TESTS not set');
}

// ─── 8. Error Handling ───────────────────────────────────────────────────────

setSection('Error Handling');

await test('AuthenticationError is instanceof APIError', async () => {
    try {
        await badClient.workspaces.list();
        throw new Error('Expected error');
    } catch (err) {
        assert(err instanceof APIError, 'Should be instanceof APIError');
        assert(err instanceof AuthenticationError, 'Should be instanceof AuthenticationError');
    }
});

await test('AuthenticationError has status 401', async () => {
    try {
        await badClient.workspaces.list();
        throw new Error('Expected error');
    } catch (err) {
        if (err instanceof AuthenticationError) {
            assert(err.status === 401, `Expected status 401, got ${err.status}`);
        } else {
            throw err;
        }
    }
});

await test('APIError exposes code string', async () => {
    try {
        await badClient.workspaces.list();
        throw new Error('Expected error');
    } catch (err) {
        if (err instanceof APIError) {
            assert(typeof err.code === 'string', 'code should be string');
            assert(err.code.length > 0, 'code should not be empty');
        } else {
            throw err;
        }
    }
});

// ─── 9. Expensive / GPU-backed ───────────────────────────────────────────────

setSection('Expensive / GPU-backed (gated by RUN_EXPENSIVE)');

if (RUN_EXPENSIVE) {
    await test('agent runs protein structure prediction via query', async () => {
        const result = await client.query.run({
            prompt: 'Predict the structure of the peptide sequence ACDEFGHIKLMNPQRSTVWY and return the result.',
            workspaceId: WORKSPACE_ID,
        });
        assert(typeof result.answer === 'string', 'Expected answer');
        assert(result.answer.length > 0, 'Answer should not be empty');
    });
} else {
    skip('agent runs protein structure prediction via query', 'RUN_EXPENSIVE not set');
    skip('tools.run Boltz structure prediction', 'RUN_EXPENSIVE not set');
}

// ─── Summary ─────────────────────────────────────────────────────────────────

const total = passed + failed + skipped;
console.log(`\n${'─'.repeat(64)}`);
console.log(`${BOLD}Results: ${passed}/${total - skipped} passed, ${failed} failed, ${skipped} skipped${RESET}`);

if (failures.length > 0) {
    console.log(`\n${RED}${BOLD}Failed tests:${RESET}`);
    for (const { section: sec, test: t, error } of failures) {
        console.log(`  ${RED}✗${RESET} [${sec}] ${t}`);
        if (error instanceof Error) {
            console.log(`      ${DIM}${error.message}${RESET}`);
        }
    }
}

if (failed === 0) {
    console.log(`\n${GREEN}${BOLD}All tests passed!${RESET}`);
    process.exit(0);
} else {
    console.log(`\n${RED}${BOLD}${failed} test(s) failed.${RESET}`);
    process.exit(1);
}

} // end main

main().catch(err => {
    console.error(`\n${RED}${BOLD}Unexpected error:${RESET}`, err);
    process.exit(1);
});
