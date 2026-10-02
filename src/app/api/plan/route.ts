import { localRequest, parseRequest, visualPlan } from '@/lib/ai-planner';

export const runtime = 'nodejs';
let working = false;
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function GET(request: Request) {
  return reply({ configured: localRequest(request) && Boolean(process.env.OPENAI_API_KEY?.trim()) });
}

export async function POST(request: Request) {
  if (!localRequest(request)) return reply({ error: 'AI planning is available only in the local workspace.' }, 403);
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return reply({ error: 'AI is not configured. Use the local planner, or set OPENAI_API_KEY in .env.local and restart.' }, 503);
  if (working) return reply({ error: 'An AI request is already running. Try again shortly.' }, 429);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'Expected JSON.' }, 415);
  working = true;
  try {
    // Bound the stream as it arrives; do not buffer an unlimited upload.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'Missing request body.' }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 3000000) { await reader.cancel(); return reply({ error: 'Sampled frames are too large.' }, 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let input;
    try { input = parseRequest(JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)))); }
    catch (error) { return reply({ error: error instanceof SyntaxError ? 'Invalid JSON.' : (error as Error).message }, 400); }
    const moments = await visualPlan(input, key, process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini', AbortSignal.any([request.signal, AbortSignal.timeout(60000)]));
    return reply({ moments });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI analysis failed.';
    return reply({ error: error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name) ? 'AI analysis was cancelled or timed out.' : message }, 502);
  } finally { working = false; }
}
