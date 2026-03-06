/**
 * Basic synchronous query example.
 * Run: npx ts-node examples/query-sync.ts
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

    console.log(`Running query in workspace: ${workspaces[0].name}`);

    const response = await client.query.run({
        prompt: 'Find BRCA1 variants associated with breast cancer',
        workspaceId,
    });

    console.log('\nAnswer:');
    console.log(response.answer);
}

main().catch(console.error);
