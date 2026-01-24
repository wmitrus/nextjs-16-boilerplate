# Storybook Integration

## Overview

This feature integrates Storybook 10 with the Next.js 16 application using the Vite-based framework (`@storybook/nextjs-vite`). It provides isolated component development, documentation, and testing through the Storybook UI and Vitest addon.

## Goals

- Provide a fast Storybook setup aligned with Next.js 16 and React 19.
- Enable component testing inside Storybook via the Vitest addon.
- Keep Storybook tests scoped to stories and component files.
- Support Tailwind CSS 4 styling in Storybook.

## Key Decisions

- Use `@storybook/nextjs-vite` as the framework for Vite compatibility.
- Use the Vitest addon for Storybook UI tests and CLI runs.
- Configure Storybook tests in `vitest.config.ts` (root) with a Storybook project.

## Configuration Summary

- Storybook config directory: `.storybook/`
- Story sources: `src/**/*.stories.@(js|jsx|mjs|ts|tsx)` and `src/**/*.mdx`
- Global styles: `src/app/globals.css` imported in `.storybook/preview.ts`
- Storybook tests: browser mode with Playwright (Chromium)

## Commands

- Start Storybook: `pnpm storybook`
- Build Storybook: `pnpm build-storybook`
- Run Storybook tests: `pnpm test:storybook`
- Watch Storybook tests: `pnpm test:storybook:watch`

## Notes

- Storybook UI test runs require Playwright browser binaries.
- Coverage includes Storybook setup files (`.storybook/**`) unless excluded.
- Unit and integration tests remain in separate configs; Storybook uses its own setup.
