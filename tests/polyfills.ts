import {
  TransformStream,
  ReadableStream,
  WritableStream,
} from 'node:stream/web';
import { TextEncoder, TextDecoder } from 'node:util';
import { BroadcastChannel } from 'node:worker_threads';
import 'whatwg-fetch';

const testGlobal = globalThis as typeof globalThis & {
  TextEncoder: typeof TextEncoder;
  TextDecoder: typeof TextDecoder;
  TransformStream: typeof TransformStream;
  ReadableStream: typeof ReadableStream;
  WritableStream: typeof WritableStream;
  BroadcastChannel: typeof BroadcastChannel;
};

testGlobal.TextEncoder = TextEncoder;
testGlobal.TextDecoder = TextDecoder;
// @ts-expect-error polyfilling TransformStream in node environment
testGlobal.TransformStream = TransformStream;
// @ts-expect-error polyfilling ReadableStream in node environment
testGlobal.ReadableStream = ReadableStream;
testGlobal.WritableStream = WritableStream;
// @ts-expect-error polyfilling BroadcastChannel in node environment
testGlobal.BroadcastChannel = BroadcastChannel;
