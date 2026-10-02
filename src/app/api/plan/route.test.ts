import { expect, test } from 'bun:test';
import { GET, POST } from './route';

test('missing-key and cross-origin requests do not reach the provider', async () => {
  const saved = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  try {
    const options = { method: 'POST', headers: { host: 'localhost:8765', origin: 'http://localhost:8765', 'content-type': 'application/json' }, body: '{}' };
    expect((await GET(new Request('http://localhost:8765/api/plan', { headers: options.headers })).json()).configured).toBe(false);
    expect((await POST(new Request('http://localhost:8765/api/plan', options))).status).toBe(503);
    expect((await POST(new Request('http://localhost:8765/api/plan', { ...options, headers: { ...options.headers, origin: 'https://evil.test' } }))).status).toBe(403);
  } finally { if (saved === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved; }
});

test('invalid and oversized payloads are rejected before a provider request', async () => {
  const saved = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'test-key';
  try {
    const make = (body: string) => new Request('http://localhost:8765/api/plan', { method: 'POST', headers: { host: 'localhost:8765', 'content-type': 'application/json' }, body });
    expect((await POST(make('{'))).status).toBe(400);
    expect((await POST(make('{}'))).status).toBe(400);
    expect((await POST(make('x'.repeat(3000001)))).status).toBe(413);
  } finally { if (saved === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved; }
});
