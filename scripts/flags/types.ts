export interface FlagEntry {
  enabled: boolean;
  tenantId: string | null;
  description?: string;
}

export interface FlagsFile {
  flags: Record<string, FlagEntry>;
}
