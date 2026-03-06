/**
 * Upload a file then queue a pipeline and wait for completion.
 * Run: FASTQ_FILE=/path/to/sample.fastq.gz npx ts-node examples/upload-and-run.ts
 */
import { SmartsBio } from '../src';

async function main() {
    const client = new SmartsBio({
        apiKey: process.env.SMARTSBIO_API_KEY,
        baseUrl: process.env.SMARTSBIO_BASE_URL ?? 'https://api.smarts.bio',
    });

    const workspaces = await client.workspaces.list();
    const workspaceId = workspaces[0]?.id;
    if (!workspaceId) throw new Error('No workspaces found');

    const fastqFile = process.env.FASTQ_FILE ?? 'sample.fastq.gz';

    // 1. Upload the input file
    console.log(`Uploading ${fastqFile}...`);
    const upload = await client.files.upload(fastqFile, {
        workspaceId,
        path: 'raw/',
    });
    console.log(`Uploaded: ${upload.key} (${upload.size} bytes)`);

    // 2. Queue the quality control pipeline
    console.log('\nQueuing quality control pipeline...');
    const pipeline = await client.pipelines.create({
        pipelineId: 'quality-control',
        workspaceId,
        input: {
            fastq: upload.key,
            output_path: 'results/qc/',
        },
    });
    console.log(`Pipeline queued: ${pipeline.id} (status: ${pipeline.status})`);

    // 3. Wait for completion
    console.log('\nWaiting for pipeline to complete...');
    const result = await client.pipelines.wait(pipeline.id, workspaceId, {
        pollInterval: 15_000,
        onProgress: (p) => {
            const pct = p.progressPct !== undefined ? ` ${p.progressPct}%` : '';
            const step = p.currentStep ? ` — ${p.currentStep}` : '';
            console.log(`  [${p.status}]${pct}${step}`);
        },
    });

    console.log(`\nPipeline ${result.status}!`);
    if (result.outputPaths?.length) {
        console.log('Output files:');
        for (const path of result.outputPaths) {
            console.log(`  ${path}`);
        }
    }
}

main().catch(console.error);
