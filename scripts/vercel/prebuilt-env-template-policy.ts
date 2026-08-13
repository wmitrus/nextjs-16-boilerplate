export const PUBLIC_PREBUILT_ENV_TEMPLATE_PATHS = [
  '.env.example',
  '.env.leantime.example',
  '.env.leantime-dev.example',
] as const;

export const PUBLIC_PREBUILT_ENV_TEMPLATE_IGNORE_RULES =
  PUBLIC_PREBUILT_ENV_TEMPLATE_PATHS.map((templatePath) => `!/${templatePath}`);

const publicPrebuiltEnvTemplatePathSet = new Set(
  PUBLIC_PREBUILT_ENV_TEMPLATE_PATHS,
);

export function isPublicPrebuiltEnvTemplatePath(requiredPath: string): boolean {
  return publicPrebuiltEnvTemplatePathSet.has(
    requiredPath as (typeof PUBLIC_PREBUILT_ENV_TEMPLATE_PATHS)[number],
  );
}
