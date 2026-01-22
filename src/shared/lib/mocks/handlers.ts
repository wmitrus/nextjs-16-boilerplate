import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/hello', () => {
    return HttpResponse.json({ message: 'Hello World' });
  }),
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: '1', name: 'MSW User 1', email: 'msw1@example.com' },
      { id: '2', name: 'MSW User 2', email: 'msw2@example.com' },
    ]);
  }),
];
