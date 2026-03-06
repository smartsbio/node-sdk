/**
 * Streaming query with real-time output.
 * Run: npx ts-node examples/query-stream.ts
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

    console.log('Streaming response:\n');

    for await (const chunk of client.query.stream({
        prompt: 'What bioinformatics tools are available for RNA-seq analysis?',
        workspaceId,
    })) {
        if (chunk.type === 'status') {
            process.stdout.write(`\n[${chunk.status ?? chunk.content}]\n`);
        } else if (chunk.type === 'content') {
            process.stdout.write(chunk.content ?? '');
        } else if (chunk.type === 'done') {
            process.stdout.write('\n\nDone.\n');
        } else if (chunk.type === 'error') {
            console.error('\nError:', chunk.error);
        }
    }
}

main().catch(console.error);
