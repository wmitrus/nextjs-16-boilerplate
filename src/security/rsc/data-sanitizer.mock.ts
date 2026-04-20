import { vi } from 'vitest';

export const mockSanitizeData = vi.fn((data: unknown) => data);

function pickDtoFields(
  data: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> {
  const allowedFieldSet = new Set(fields);

  return Object.fromEntries(
    Object.entries(data).filter(([key]) => allowedFieldSet.has(key)),
  );
}

export const mockToDTO = vi.fn(
  (data: Record<string, unknown>, fields: string[]) =>
    pickDtoFields(data, fields),
);

export function resetDataSanitizerMocks() {
  mockSanitizeData.mockReset();
  mockSanitizeData.mockImplementation((data) => data);
  mockToDTO.mockReset();
  mockToDTO.mockImplementation((data, fields) => pickDtoFields(data, fields));
}

vi.mock('./data-sanitizer', () => ({
  sanitizeData: (data: unknown) => mockSanitizeData(data),
  toDTO: (data: Record<string, unknown>, fields: string[]) =>
    mockToDTO(data, fields),
}));
