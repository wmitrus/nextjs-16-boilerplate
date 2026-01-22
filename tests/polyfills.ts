import {
  TransformStream,
  ReadableStream,
  WritableStream,
} from 'node:stream/web';
import { TextEncoder, TextDecoder } from 'node:util';
import { BroadcastChannel } from 'node:worker_threads';
import 'whatwg-fetch';

global.TextEncoder = TextEncoder;
// @ts-expect-error polyfilling TextDecoder in node environment
global.TextDecoder = TextDecoder;
// @ts-expect-error polyfilling TransformStream in node environment
global.TransformStream = TransformStream;
// @ts-expect-error polyfilling ReadableStream in node environment
global.ReadableStream = ReadableStream;
// @ts-expect-error polyfilling WritableStream in node environment
global.WritableStream = WritableStream;
// @ts-expect-error polyfilling BroadcastChannel in node environment
global.BroadcastChannel = BroadcastChannel;
