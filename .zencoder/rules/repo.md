---
description: Repository Information Overview
alwaysApply: true
---

# temp-nextjs-scaffold Information

## Summary
This is a modern **Next.js 16** boilerplate project bootstrapped with `create-next-app`. It features a lean setup with **React 19**, **TypeScript**, and **Tailwind CSS 4**, following the **Next.js App Router** architecture.

## Structure
- **src/app**: Core application logic using the Next.js App Router. Contains routes, layouts, and global styles.
- **public**: Static assets like icons and images.
- **root**: Configuration files for TypeScript, ESLint, PostCSS, and Next.js.

## Language & Runtime
**Language**: TypeScript  
**Version**: ^5 (TypeScript), Node.js ^20  
**Build System**: Next.js Build  
**Package Manager**: pnpm (indicated by `pnpm-lock.yaml`)

## Dependencies
**Main Dependencies**:
- **next**: 16.1.4
- **react**: 19.2.3
- **react-dom**: 19.2.3

**Development Dependencies**:
- **tailwindcss**: ^4
- **eslint**: ^9
- **typescript**: ^5
- **@types/node**: ^20
- **@types/react**: ^19
- **@types/react-dom**: ^19

## Build & Installation
```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Linting
pnpm lint
```

## Main Files & Resources
- **src/app/page.tsx**: Main entry point for the homepage.
- **src/app/layout.tsx**: Root layout component.
- **next.config.ts**: Next.js configuration.
- **eslint.config.mjs**: ESLint flat configuration.
- **tsconfig.json**: TypeScript configuration.
- **tailwind.config.mjs**: PostCSS/Tailwind configuration.

## Project Structure
- **src/**: Application source code.
- **public/**: Static public assets.
- **package.json**: Project manifest and scripts.
- **pnpm-lock.yaml**: Dependency lockfile.
