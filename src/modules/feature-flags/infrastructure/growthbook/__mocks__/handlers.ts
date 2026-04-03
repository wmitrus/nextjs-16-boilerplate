import { http, HttpResponse } from 'msw';

export interface GrowthBookFeaturesResponse {
  status: number;
  features: Record<string, { defaultValue: boolean; rules?: unknown[] }>;
}

export function makeFeaturesResponse(
  features: Record<string, boolean>,
): GrowthBookFeaturesResponse {
  return {
    status: 200,
    features: Object.fromEntries(
      Object.entries(features).map(([key, defaultValue]) => [
        key,
        { defaultValue },
      ]),
    ),
  };
}

export const defaultGrowthBookResponse = makeFeaturesResponse({
  'enabled-flag': true,
  'disabled-flag': false,
  'any-flag': false,
});

export const growthbookHandlers = [
  http.get('https://cdn.growthbook.io/api/features/:clientKey', () =>
    HttpResponse.json(defaultGrowthBookResponse),
  ),
];
