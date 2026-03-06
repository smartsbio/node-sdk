/**
 * Generate a shareable browser viewer URL for a bioinformatics file.
 * Run: FILE_KEY=orgs/.../file.vcf npx ts-node examples/viewer-url.ts
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

    const fileKey = process.env.FILE_KEY;
    if (!fileKey) {
        console.error('Set FILE_KEY env var to the S3 key of the file you want to view');
        process.exit(1);
    }

    const result = await client.visualizations.viewerUrl({
        filePath: fileKey,
        workspaceId,
        expiresIn: 3600,
    });

    console.log(`Format detected: ${result.format}`);
    console.log(`Viewer URL (valid for ${result.expiresIn}s):`);
    console.log(result.viewerUrl);
}

main().catch(console.error);
