import { expect, test } from 'bun:test';
import { localRequest, parseRequest, visualPlan, type PlanRequest } from './ai-planner';

type Send = (url: string, options: RequestInit) => Promise<Response>;
const input: PlanRequest = { prompt: 'A cafe opening', target: 10, clips: [{ id: 'a', name: 'Coffee', notes: '', tags: [], favorite: false, duration: 20, frames: [1, 5, 15].map(time => ({ time, image: 'data:image/jpeg;base64,aGVsbG8=' })) }] };
const moment = { clipId: 'a', in: 1, out: 5, title: 'Opening', reason: 'Coffee in the sampled frame. Timing is approximate.' };
const completed = (moments: unknown) => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ moments }) }] }] });

test('accepts bounded image data and rejects links, duplicate IDs, invalid timestamps', () => {
  expect(parseRequest(input)).toEqual(input);
  for (const image of ['https://example.com/frame.jpg', 'data:text/html;base64,aGVsbG8=']) expect(() => parseRequest({ ...input, clips: [{ ...input.clips[0], frames: input.clips[0].frames.map(f => ({ ...f, image })) }] })).toThrow();
  expect(() => parseRequest({ ...input, clips: [input.clips[0], input.clips[0]] })).toThrow();
  expect(() => parseRequest({ ...input, target: Infinity })).toThrow();
  expect(() => parseRequest({ ...input, clips: [{ ...input.clips[0], frames: [{ ...input.clips[0].frames[0], time: 30 }] }] })).toThrow();
});

test('sends frames and strict output schema, validates the returned cut', async () => {
  const send = (async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    expect(body.store).toBe(false); expect(body.text.format.strict).toBe(true);
    expect(body.input[0].content.filter((c: { type: string }) => c.type === 'input_image')).toHaveLength(3);
    expect(body.instructions).toContain('untrusted footage data');
    return completed([moment]);
  }) as Send;
  expect(await visualPlan(input, 'test-key', 'test-model', new AbortController().signal, send)).toEqual([moment]);
  const invented = (async () => completed([{ ...moment, clipId: 'invented' }])) as Send;
  await expect(visualPlan(input, 'test-key', 'test-model', new AbortController().signal, invented)).rejects.toThrow('missing clip');
});

test('handles quota, refusal, truncated responses and cancellation without using fake suggestions', async () => {
  const cases = [
    [new Response('', { status: 429 }), 'quota'],
    [Response.json({ status: 'incomplete' }), 'did not complete'],
    [Response.json({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }), 'declined'],
  ] as const;
  for (const [response, message] of cases) await expect(visualPlan(input, 'test-key', 'test-model', new AbortController().signal, (async () => response) as Send)).rejects.toThrow(message);
  const abort = new AbortController(); abort.abort();
  await expect(visualPlan(input, 'test-key', 'test-model', abort.signal, (async (_url: unknown, options: RequestInit) => { options.signal?.throwIfAborted(); return completed([moment]); }) as Send)).rejects.toThrow();
});

test('only accepts requests for the local host with the same origin', () => {
  const request = (url: string, host: string, origin?: string) => new Request(url, { headers: { host, ...(origin ? { origin } : {}) } });
  expect(localRequest(request('http://localhost:8765/api/plan', 'localhost:8765', 'http://localhost:8765'))).toBe(true);
  expect(localRequest(request('http://localhost:8765/api/plan', 'localhost:8765', 'https://evil.test'))).toBe(false);
  expect(localRequest(request('https://studio.example/api/plan', 'studio.example'))).toBe(false);
  expect(localRequest(request('http://localhost:8765/api/plan', 'evil.test'))).toBe(false);
});
