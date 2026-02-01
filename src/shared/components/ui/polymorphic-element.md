# PolymorphicElement Architecture

This document describes the design decisions behind the `PolymorphicElement` primitive and provides examples of its usage in a production environment.

## 1. Planned (Conceptual) vs. Current (Production)

The initial plan aimed for a "pure" implementation using only `forwardRef`. However, due to the way TypeScript handles generics inside higher-order components, a more robust architectural pattern was implemented.

### Current Implementation (Production-Ready)

```typescript
const PolymorphicElement = forwardRef(...) as PolymorphicComponent;
```

**Pros:**

- **Full Type Inference**: Correctically identifies attributes based on the `as` prop (e.g., `href` for `as="a"`).
- **CI/CD Stability**: Successfully passes `pnpm typecheck` by bypassing `ForwardRefRenderFunction` generic limitations.
- **Strict Public API**: Consumers benefit from perfect typing even if the internal implementation uses `any` to bridge React's type-system gaps.

**Cons:**

- Requires internal ESLint suppression for `any`.
- Requires an explicit `PolymorphicComponent` type definition.

### Planned Implementation (Conceptual)

```typescript
const PolymorphicElement = forwardRef(<T extends ElementType>(...) => { ... });
```

**Pros:**

- Complete type purity without `any`.
- Less boilerplate.

**Cons:**

- **Generic Erasure**: Frequently loses the generic link between the `as` prop and allowed attributes when returned from `forwardRef`.
- **Compiler Errors**: Triggers `TS2345` because `ForwardRefRenderFunction` doesn't natively support dynamic generic refs.

---

## 2. Usage Examples

The `PolymorphicElement` is designed to be safe and flexible for all use cases.

### Basic Usage (Without Ref)

Standard usage as a `div` (default) or a specific semantic tag.

```tsx
// Default as 'div'
<PolymorphicElement className="p-4 bg-zinc-100">
  Standard Div Content
</PolymorphicElement>

// Semantic 'section'
<PolymorphicElement as="section" className="py-8">
  Section Content
</PolymorphicElement>
```

### Type-Safe Attributes (Without Ref)

TypeScript will enforce that attributes match the `as` prop.

```tsx
// This works perfectly: 'href' is valid for 'a'
<PolymorphicElement as="a" href="https://nextjs.org" target="_blank">
  Visit Next.js
</PolymorphicElement>

// TypeScript Error: 'href' does not exist on 'button'
// <PolymorphicElement as="button" href="/somewhere">Invalid</PolymorphicElement>
```

### Usage With Refs

The implementation ensures that `ref` is correctly typed to the underlying HTML element.

```tsx
import { useRef, useEffect } from 'react';

const MyComponent = () => {
  // Correctly typed as HTMLButtonElement
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Correctly typed as HTMLAnchorElement
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    buttonRef.current?.focus();
    console.log(linkRef.current?.href);
  }, []);

  return (
    <>
      <PolymorphicElement
        as="button"
        ref={buttonRef}
        onClick={() => console.log('clicked')}
      >
        Focusable Button
      </PolymorphicElement>

      <PolymorphicElement as="a" ref={linkRef} href="/about">
        Trackable Link
      </PolymorphicElement>
    </>
  );
};
```

### Integration with `forwardRef` in Sub-components

This is the pattern used for all landing page sections.

```tsx
const CustomSection = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, ...props }, ref) => {
  return (
    <PolymorphicElement
      as="section"
      ref={ref}
      className={cn('bg-white', className)}
      {...props}
    />
  );
});
```

---

## 3. Conclusion

The current implementation is the **Senior Architect** choice because it prioritizes **Developer Experience (DX)** and **Type Integrity** at the point of use, while handling the complexity of React's internal type-system limitations behind the scenes.
