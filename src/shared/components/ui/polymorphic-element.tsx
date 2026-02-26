import type {
  ComponentPropsWithoutRef,
  ElementType,
  PropsWithChildren,
  ReactElement,
} from 'react';
import { forwardRef } from 'react';

import { cn } from '@/shared/utils/cn';

type PolymorphicElementProps<T extends ElementType> =
  ComponentPropsWithoutRef<T> & {
    as?: T;
  };

type PolymorphicComponent = {
  <T extends ElementType = 'div'>(
    props: PropsWithChildren<PolymorphicElementProps<T>> & {
      ref?: React.ComponentPropsWithRef<T>['ref'];
    },
  ): ReactElement | null;
  displayName?: string;
};

// Internal implementation uses unknown for the ref to avoid complex generic issues
// but the exported PolymorphicElement is strictly typed via PolymorphicComponent
const PolymorphicElement = forwardRef(
  (
    {
      as,
      children,
      className,
      ...rest
    }: PropsWithChildren<PolymorphicElementProps<ElementType>>,
    ref: unknown,
  ): ReactElement => {
    const Component = as || 'div';

    return (
      <Component
        ref={ref as React.Ref<never>}
        className={cn(className)}
        {...rest}
      >
        {children}
      </Component>
    );
  },
) as PolymorphicComponent;

PolymorphicElement.displayName = 'PolymorphicElement';

export default PolymorphicElement;
