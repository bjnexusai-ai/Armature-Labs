import React from 'react';

import { useAuth } from '../lib/auth/AuthContext';
import { Button } from './Button';

/**
 * Temporary — lets M1 be tested end-to-end (sign in -> land in tabs ->
 * sign out -> back to login) before there's a real Settings/Profile
 * screen to host this. Move into Settings once that screen exists
 * (not in M1's scope per plan §1).
 */
export function LogoutButton() {
  const { logout } = useAuth();
  return <Button label="Sign out" variant="secondary" onPress={() => logout()} />;
}
