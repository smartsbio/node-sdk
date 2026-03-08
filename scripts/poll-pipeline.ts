#!/usr/bin/env npx tsx
/**
 * poll-pipeline — watch a running pipeline until it finishes.
 *
 * Usage:
 *   SMARTSBIO_API_KEY=sk_live_... \
 *   SMARTSBIO_WORKSPACE_ID=ws_... \
 *   npx tsx scripts/poll-pipeline.ts <pipelineId> [pollIntervalSeconds]
 *
 * Examples:
 *   npx tsx scripts/poll-pipeline.ts abc123
 *   npx tsx scripts/poll-pipeline.ts abc123 30
 */

import { SmartsBio } from '../src/index';
import { APIError } from '../src/errors';

const pipelineId = process.argv[2];
const pollSeconds = parseInt(process.argv[3] ?? '15', 10);

const apiKey = process.env.SMARTSBIO_API_KEY;
const workspaceId = process.env.SMARTSBIO_WORKSPACE_ID;
const baseURL = process.env.SMARTSBIO_BASE_URL;

if (!pipelineId) {
    console.error('Usage: npx tsx scripts/poll-pipeline.ts <pipelineId> [pollIntervalSeconds]');
    process.exit(1);
}
if (!apiKey) {
    console.error('Error: SMARTSBIO_API_KEY is required');
    process.exit(1);
}
if (!workspaceId) {
    console.error('Error: SMARTSBIO_WORKSPACE_ID is required');
    process.exit(1);
}

const client = new SmartsBio({ apiKey, ...(baseURL ? { baseURL } : {}) });

console.log(`Polling pipeline ${pipelineId} every ${pollSeconds}s...\n`);

function formatPct(pct?: number): string {
    return pct != null ? `${pct}%` : '—';
}

(async () => {
    try {
        const result = await client.pipelines.wait(pipelineId, workspaceId, {
            pollInterval: pollSeconds * 1000,
            onProgress: (p) => {
                const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
                console.log(`[${ts}] status=${p.status}  progress=${formatPct(p.progressPct)}  step=${p.currentStep ?? '—'}`);
            },
        });

        console.log('\nPipeline completed successfully.');
        if (result.outputPaths?.length) {
            console.log('Output paths:');
            for (const p of result.outputPaths) console.log(' ', p);
        }
        if (result.logsPath) {
            console.log('Logs:', result.logsPath);
        }
        process.exit(0);
    } catch (err) {
        if (err instanceof APIError) {
            console.error(`\nPipeline failed: [${err.code}] ${err.message}`);
        } else {
            console.error('\nUnexpected error:', err);
        }
        process.exit(1);
    }
})();
