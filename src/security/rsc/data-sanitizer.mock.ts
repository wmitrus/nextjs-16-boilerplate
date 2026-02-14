import { vi } from 'vitest';

export const mockSanitizeData = vi.fn((data: unknown) => data);
export const mockToDTO = vi.fn(
  (data: Record<string, unknown>, fields: string[]) => {
    const dto: Record<string, unknown> = {};
    fields.forEach((f) => {
      dto[f] = data[f];
    });
    return dto;
  },
);

export function resetDataSanitizerMocks() {
  mockSanitizeData.mockReset();
  mockSanitizeData.mockImplementation((data) => data);
  mockToDTO.mockReset();
  mockToDTO.mockImplementation((data, fields) => {
    const dto: Record<string, unknown> = {};
    fields.forEach((f) => {
      dto[f] = data[f];
    });
    return dto;
  });
}

vi.mock('./data-sanitizer', () => ({
  sanitizeData: (data: unknown) => mockSanitizeData(data),
  toDTO: (data: Record<string, unknown>, fields: string[]) =>
    mockToDTO(data, fields),
}));
