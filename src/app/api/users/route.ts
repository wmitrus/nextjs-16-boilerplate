import { NextResponse } from 'next/server';

import { serverLogger } from '@/core/logger/server';

const sampleUsers = [
  { id: '1', name: 'Ada Lovelace', email: 'ada@sample.dev' },
  { id: '2', name: 'Alan Turing', email: 'alan@sample.dev' },
  { id: '3', name: 'Grace Hopper', email: 'grace@sample.dev' },
];

export async function GET() {
  serverLogger.info({ count: sampleUsers.length }, 'Serving sample users');
  return NextResponse.json(sampleUsers, { status: 200 });
}
