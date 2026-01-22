import React from 'react';

import type { User } from '../types';

interface UserListProps {
  users: User[];
  loading?: boolean;
  error?: string | null;
}

export const UserList: React.FC<UserListProps> = ({
  users,
  loading,
  error,
}) => {
  if (loading) {
    return <div aria-label="loading">Loading...</div>;
  }

  if (error) {
    return <div role="alert">{error}</div>;
  }

  if (users.length === 0) {
    return <div>No users found.</div>;
  }

  return (
    <ul className="space-y-2">
      {users.map((user) => (
        <li
          key={user.id}
          className="flex flex-col rounded border p-4 shadow-sm"
          data-testid="user-item"
        >
          <span className="font-bold">{user.name}</span>
          <span className="text-gray-600">{user.email}</span>
        </li>
      ))}
    </ul>
  );
};
