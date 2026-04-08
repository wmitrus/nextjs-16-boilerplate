const NEW_RELIC_PRELOAD_PATTERN =
  /(^|\s)(-r|--require)\s+(newrelic|(?:\.\/)?scripts\/new-relic\/preload\.cjs)(\s|$)/u;

export function nodeOptionsPreloadsNewRelic(
  nodeOptions: string | undefined,
): boolean {
  const normalizedNodeOptions = nodeOptions?.trim() ?? '';
  return NEW_RELIC_PRELOAD_PATTERN.test(normalizedNodeOptions);
}
