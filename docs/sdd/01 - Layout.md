You are designing a production‑ready landing layout for a Next.js 16.2 application using plain Tailwind CSS. Produce a complete Software Design Document (SDD) and implementation plan for a fully responsive, modern, professional landing page that integrates cleanly with my Next.js‑16 boilerplate architecture.

## 1. Context and Scope

- Framework: Next.js 16.2 (App Router, React 19.x)
- Styling: Tailwind CSS (no UI libraries, no component frameworks)
- Page: Entire layout must exist on the **home page** (`app/page.tsx`)
- Layout must integrate with the boilerplate’s conventions:
  - `app/layout.tsx` for global wrappers
  - `app/components/*` for shared UI
  - `app/(marketing)/*` or similar route groups if needed
  - Must be compatible with future Clerk integration and the Security Suite (CSP, CSRF, sanitization)

## 2. High-Level Goals

Design a polished, premium landing page layout with:

1. **Header**
   - Logo area
   - Navigation links
   - Avatar placeholder (future: Clerk user avatar)
   - Sticky or static variant depending on best UX practice

2. **Hero Section**
   - Strong headline + subheadline
   - CTA buttons (primary + secondary)
   - Optional supporting image or illustration
   - Must be fully responsive and visually balanced

3. **Story Section 1**
   - Text left, image right
   - Clean typography
   - Tailwind-based grid or flex layout

4. **Story Section 2**
   - Scroll-driven image change or subtle scroll animation
   - Must be implemented using **CSS + minimal JS only**
   - No external animation libraries unless absolutely necessary

5. **Feature Breakdown**
   - Grid of features (3–6 items)
   - Icons (Tailwind/heroicons or inline SVG)
   - Clear hierarchy and spacing

6. **Use Cases Section**
   - Cards or vertical list
   - Each use case includes title, description, and optional icon

7. **CTA Section**
   - Strong call to action
   - Button group
   - Background variant (gradient, subtle pattern, or solid color)

8. **Footer**
   - Navigation links
   - Social links
   - Avatar placeholder (mirrors header)
   - Copyright

## 3. Design Requirements

- Must use **pure Tailwind**, no external UI kits.
- Must follow modern landing page patterns:
  - Generous spacing
  - Clean typography
  - Balanced white space
  - Smooth responsive scaling
- Must be accessible (WCAG AA):
  - Semantic HTML
  - ARIA where needed
  - Keyboard navigability
  - Sufficient color contrast

## 4. Component Architecture

Produce a recommended file structure such as:

- `app/components/layout/Header.tsx`
- `app/components/layout/Footer.tsx`
- `app/components/sections/Hero.tsx`
- `app/components/sections/StoryOne.tsx`
- `app/components/sections/StoryTwo.tsx`
- `app/components/sections/Features.tsx`
- `app/components/sections/UseCases.tsx`
- `app/components/sections/CTA.tsx`

Each component must:

- Be server-compatible by default
- Use Tailwind classes only
- Avoid client components unless necessary (e.g., scroll animation)
- Be compatible with CSP nonces (no inline scripts)

## 5. Integration With Boilerplate Features

The SDD must describe how the layout integrates with:

- The existing `app/layout.tsx` structure
- The future **Clerk authentication layer**
  - Avatar slot must be compatible with Clerk’s `<UserButton />`
- The future **Security Suite**
  - CSP nonces must not break any scripts
  - No inline event handlers
  - No unsafe inline styles
  - No un-sanitized HTML injection

## 6. Implementation Details

Provide:

- Tailwind utility class patterns for each section
- Responsive breakpoints and layout rules
- Suggested color palette and spacing scale
- Typography hierarchy
- Animation approach for scroll-driven Story Section 2
- Accessibility considerations
- SEO considerations (headings, metadata, semantic structure)

Additionaly, every component must implement PolymorphicElement desccribed here:

```typescript
import type {
  ComponentPropsWithoutRef,
  ElementType,
  PropsWithChildren,
  ReactElement,
} from 'react';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

type PolymorphicElementProps<T extends ElementType> =
  ComponentPropsWithoutRef<T> & {
    as?: T;
  };

const PolymorphicElement = forwardRef(
  <T extends ElementType>(
    {
      as,
      children,
      className,
      ...rest
    }: PropsWithChildren<PolymorphicElementProps<T>>,
    ref: React.ComponentPropsWithRef<T>['ref'],
  ): ReactElement => {
    const Element = as || 'div';

    return (
      <Element ref={ref} className={cn('', className)} {...rest}>
        {children}
      </Element>
    );
  },
);

PolymorphicElement.displayName = 'PolymorphicElement';

export default PolymorphicElement;
```

Example:

```tsx
import * as React from 'react';

import { cn } from '@/lib/utils';

import PolymorphicElement from './polymorphic-element';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <PolymorphicElement
        as="input"
        type={type}
        className={cn('', className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
```

## 7. Deliverables

Produce:

1. A complete SDD describing:
   - Architecture
   - Component responsibilities
   - Data flow
   - Styling strategy
   - Accessibility and SEO considerations

2. A step-by-step implementation plan:
   - Component creation order
   - Tailwind configuration adjustments
   - Integration with layout and routing
   - Testing and validation

3. A final checklist for production readiness:
   - Responsive behavior validated
   - No CSP violations
   - No inline scripts/styles
   - No layout shift issues
   - Lighthouse performance and accessibility targets met

Be explicit, opinionated, and practical. Assume the reader is a senior engineer who wants a clean, scalable, production-grade landing layout aligned with Next.js 16.2 best practices.
