import type {Project, RendererSettings} from '@canvas-commons/core';
import {describe, expect, test, vi} from 'vitest';
import {FFmpegExporterClient} from '../FFmpegExporterClient';

interface Deferred {
  method: string;
  data: unknown;
  resolve: () => void;
}

function createClient() {
  const calls: Deferred[] = [];
  const client = new FFmpegExporterClient(
    {} as Project,
    {} as RendererSettings,
  );
  vi.spyOn(
    client as unknown as {invoke: (method: string, data: unknown) => unknown},
    'invoke',
  ).mockImplementation(
    (method, data) =>
      new Promise<void>(resolve => calls.push({method, data, resolve})),
  );
  return {client, calls};
}

function frame(value: number) {
  const canvas = {width: 1, height: 1} as HTMLCanvasElement;
  const context = {
    getImageData: () => ({data: new Uint8ClampedArray([value])}),
  } as unknown as CanvasRenderingContext2D;
  return [canvas, 0, 0, '', new AbortController().signal, context] as const;
}

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('FFmpegExporterClient', () => {
  test('sends a frame once the previous one was received', async () => {
    const {client, calls} = createClient();

    const first = client.handleFrame(...frame(1));
    const second = client.handleFrame(...frame(2));
    await flush();
    expect(calls.map(call => call.data)).toEqual([new Uint8ClampedArray([1])]);

    calls[0].resolve();
    await first;
    await flush();
    expect(calls.map(call => call.data)).toEqual([
      new Uint8ClampedArray([1]),
      new Uint8ClampedArray([2]),
    ]);

    calls[1].resolve();
    await second;
  });

  test('ends the export after the last frame was received', async () => {
    const {client, calls} = createClient();

    await client.handleFrame(...frame(1));
    const stop = client.stop(0);
    await flush();
    expect(calls.map(call => call.method)).toEqual(['handleFrame']);

    calls[0].resolve();
    await flush();
    expect(calls.map(call => call.method)).toEqual(['handleFrame', 'end']);
    calls[1].resolve();
    await stop;
  });
});
