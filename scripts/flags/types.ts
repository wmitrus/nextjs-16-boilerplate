export interface FlagEntry {
  key: string;
  enabled: boolean;
  tenantId: string | null;
  description?: string;
}

export interface FlagsFile {
  flags: FlagEntry[];
}
