import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar } from './avatar';

describe('Avatar', () => {
  it('uses first and last name initials when a full name is provided', () => {
    render(<Avatar name="Ada Lovelace" />);

    expect(screen.getByLabelText('Ada Lovelace')).toHaveTextContent('AL');
  });

  it('falls back to email initial and custom size classes', () => {
    render(<Avatar email="person@example.com" size="lg" />);

    const avatar = screen.getByLabelText('person@example.com');
    expect(avatar).toHaveTextContent('P');
    expect(avatar).toHaveClass('h-11', 'w-11', 'text-base');
  });

  it('uses a single-name initial', () => {
    render(<Avatar name="Prince" size="sm" />);

    const avatar = screen.getByLabelText('Prince');
    expect(avatar).toHaveTextContent('P');
    expect(avatar).toHaveClass('h-7', 'w-7', 'text-xs');
  });

  it('renders a fallback question mark when no identity fields are available', () => {
    render(<Avatar />);

    expect(screen.getByLabelText('User avatar')).toHaveTextContent('?');
  });

  it('renders the image variant with matching dimensions and alt text', () => {
    render(
      <Avatar
        name="Grace Hopper"
        imageUrl="https://example.com/avatar.png"
        size="sm"
      />,
    );

    const image = screen.getByRole('img', { name: 'Grace Hopper' });
    expect(image).toHaveAttribute('src', 'https://example.com/avatar.png');
    expect(image).toHaveAttribute('width', '28');
    expect(image).toHaveAttribute('height', '28');
  });
});
