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

// We use any for the internal forwardRef implementation to avoid complex generic issues
// but the exported PolymorphicElement is strictly typed via PolymorphicComponent
const PolymorphicElement = forwardRef(
  (
    {
      as,
      children,
      className,
      ...rest
    }: PropsWithChildren<PolymorphicElementProps<ElementType>>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref: any,
  ): ReactElement => {
    const Component = as || 'div';

    return (
      <Component ref={ref} className={cn(className)} {...rest}>
        {children}
      </Component>
    );
  },
) as PolymorphicComponent;

PolymorphicElement.displayName = 'PolymorphicElement';

export default PolymorphicElement;
