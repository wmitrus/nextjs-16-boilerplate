import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SortableHeaderButton } from './SortableHeaderButton';

describe('SortableHeaderButton', () => {
  it('renders an accessible sortable header button and handles clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <SortableHeaderButton
        direction="asc"
        label="Sort by email"
        onClick={onClick}
      >
        Email
      </SortableHeaderButton>,
    );

    const button = screen.getByRole('button', { name: 'Sort by email' });
    expect(button).toHaveTextContent('Email');

    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders without a click handler for unsorted headers', () => {
    render(
      <SortableHeaderButton direction={false} label="Sort by status">
        Status
      </SortableHeaderButton>,
    );

    expect(
      screen.getByRole('button', { name: 'Sort by status' }),
    ).toBeInTheDocument();
  });
});
