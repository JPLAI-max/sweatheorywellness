import { useEffect } from 'react';
import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { isLoggedIn, clearAuth, setLoggedIn, getCurrentUserId } from '../lib/auth';

export function useCurrentUser() {
  const isAuth = isLoggedIn();

  const { data: user, isLoading, error } = useGetMe({
    query: {
      enabled: isAuth,
      retry: false,
      // Keep stale time short so window-focus refetches catch account switches
      // (e.g. logging in as a different user in another tab).
      staleTime: 30 * 1000,
      refetchOnWindowFocus: true,
      queryKey: getGetMeQueryKey()
    }
  });

  // If the server says the session is invalid (cookie expired/revoked),
  // clear the stale localStorage flag so the UI shows as logged out.
  useEffect(() => {
    if (isAuth && !isLoading && error) {
      clearAuth();
    }
  }, [isAuth, isLoading, error]);

  // Bug 2 guard: the JWT cookie is the source of truth for who is authenticated.
  // If localStorage says one user but the server's cookie belongs to another,
  // sync localStorage to match the cookie owner so the UI correctly reflects
  // who will actually author new posts, messages, etc.
  useEffect(() => {
    if (user?.id != null) {
      const storedId = getCurrentUserId();
      if (storedId !== user.id) {
        setLoggedIn(user.id);
      }
    }
  }, [user?.id]);

  return {
    user: user ?? null,
    isLoading: isAuth ? isLoading : false,
    error,
    // Use the localStorage flag directly — true while the API is still loading,
    // so the UI never briefly shows a logged-out state on page return.
    isLoggedIn: isAuth,
  };
}
