# Technical Specification - Landing Page

## 1. Technical Context

- **Framework**: Next.js 16.2 (App Router)
- **Language**: TypeScript 5.x
- **React**: 19.x
- **Styling**: Tailwind CSS 4.x
- **Icons**: Inline SVG or Lucide React (if available, otherwise inline SVGs for zero dependencies)

## 2. Implementation Approach

- **Polymorphic Components**: All landing page components will be built using a `PolymorphicElement` base component to allow flexible HTML tags while maintaining strict typing.
- **Server Components**: All sections will be React Server Components (RSCs) by default to minimize client-side JavaScript.
- **Client Components**: Only `StoryTwo` (for scroll animations) and potentially `Header` (for mobile menu toggle) will use `"use client"`.
- **CSS-First Animations**: Scroll animations in `StoryTwo` will prioritize CSS `scroll-timeline` or simple Intersection Observer patterns to maintain CSP compliance.

## 3. Source Code Structure Changes

New components will be organized under `src/shared/components/landing` or `src/app/(marketing)/components` depending on their specificity. Given the instructions, we'll use:

- `src/shared/components/ui/polymorphic-element.tsx`: Base polymorphic component.
- `src/app/components/layout/Header.tsx`
- `src/app/components/layout/Footer.tsx`
- `src/app/components/sections/Hero.tsx`
- `src/app/components/sections/StoryOne.tsx`
- `src/app/components/sections/StoryTwo.tsx`
- `src/app/components/sections/Features.tsx`
- `src/app/components/sections/UseCases.tsx`
- `src/app/components/sections/CTA.tsx`

## 4. Component Interfaces

### PolymorphicElement

```typescript
type PolymorphicElementProps<T extends ElementType> =
  ComponentPropsWithoutRef<T> & { as?: T };
```

### Generic Section Props

```typescript
interface SectionProps {
  className?: string;
  id?: string;
}
```

## 5. Delivery Phases

### Phase 1: Foundation

- Implement `PolymorphicElement`.
- Set up the layout structure (Header, Footer).

### Phase 2: Core Content

- Implement `Hero`, `StoryOne`, and `Features` sections.
- Integrate into `app/page.tsx`.

### Phase 3: Advanced Sections

- Implement `StoryTwo` (scroll-driven), `UseCases`, and `CTA`.
- Refine responsive behavior.

### Phase 4: Finalization

- Accessibility audit.
- SEO metadata implementation.
- Linting and type-checking.

## 6. Verification Approach

- **Linting**: `pnpm lint`
- **Type-checking**: `pnpm typecheck`
- **Manual Verification**: Visual inspection at breakpoints (320px, 768px, 1024px, 1440px).
- **Accessibility**: Use axe-core or Chrome DevTools Accessibility tab.
