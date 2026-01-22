import { render, screen } from '@testing-library/react';
import React from 'react';

import { UserList } from './UserList';

describe('UserList', () => {
  const mockUsers = [
    { id: '1', name: 'John Doe', email: 'john@example.com' },
    { id: '2', name: 'Jane Doe', email: 'jane@example.com' },
  ];

  it('renders loading state', () => {
    render(<UserList users={[]} loading={true} />);
    expect(screen.getByLabelText('loading')).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<UserList users={[]} error="Something went wrong" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('renders empty state', () => {
    render(<UserList users={[]} />);
    expect(screen.getByText('No users found.')).toBeInTheDocument();
  });

  it('renders a list of users', () => {
    render(<UserList users={mockUsers} />);
    expect(screen.getAllByTestId('user-item')).toHaveLength(2);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });
});
