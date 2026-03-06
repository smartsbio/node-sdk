import { StreamChunk } from './types';

/**
 * Parses a Server-Sent Events stream from a fetch Response body
 * and yields StreamChunk objects.
 */
export async function* parseSSEStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? '';

            for (const part of parts) {
                const lines = part.split('\n');
                let data = '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        data = line.slice(6).trim();
                    }
                }
                if (!data || data === '[DONE]') continue;
                try {
                    yield JSON.parse(data) as StreamChunk;
                } catch {
                    // skip malformed events
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}
