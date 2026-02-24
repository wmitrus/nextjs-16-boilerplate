import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import PolymorphicElement from './polymorphic-element';

describe('PolymorphicElement', () => {
  it('renders as a div by default', () => {
    render(<PolymorphicElement>Default Content</PolymorphicElement>);
    const element = screen.getByText('Default Content');
    expect(element.tagName).toBe('DIV');
  });

  it('renders as a custom element when "as" prop is provided', () => {
    render(
      <PolymorphicElement as="section">Section Content</PolymorphicElement>,
    );
    const element = screen.getByText('Section Content');
    expect(element.tagName).toBe('SECTION');
  });

  it('renders as a span', () => {
    render(<PolymorphicElement as="span">Span Content</PolymorphicElement>);
    const element = screen.getByText('Span Content');
    expect(element.tagName).toBe('SPAN');
  });

  it('applies custom className', () => {
    render(
      <PolymorphicElement className="custom-class">Content</PolymorphicElement>,
    );
    const element = screen.getByText('Content');
    expect(element.classList.contains('custom-class')).toBe(true);
  });
});
