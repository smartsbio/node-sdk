/**
 * List all available bioinformatics tools.
 * Run: npx ts-node examples/list-tools.ts
 */
import { SmartsBio } from '../src';

async function main() {
    const client = new SmartsBio({
        apiKey: process.env.SMARTSBIO_API_KEY,
        baseUrl: process.env.SMARTSBIO_BASE_URL ?? 'https://api.smarts.bio',
    });

    const tools = await client.tools.list();
    console.log(`Found ${tools.length} tools:\n`);

    for (const tool of tools) {
        console.log(`  ${tool.name} (${tool.id})`);
        if (tool.description) {
            console.log(`    ${tool.description.slice(0, 80)}${tool.description.length > 80 ? '...' : ''}`);
        }
    }
}

main().catch(console.error);
