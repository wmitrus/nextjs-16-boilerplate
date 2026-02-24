import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook that prevents hydration mismatches by maintaining
 * server-safe initial state across SSR and client render.
 *
 * This hook is useful for state that depends on client-only features like:
 * - `typeof window` checks
 * - localStorage or sessionStorage
 * - Date.now() or Math.random()
 * - navigator.onLine or other client-only APIs
 *
 * The hook returns the SSR-safe value immediately during hydration,
 * then optionally updates with a client-computed value after hydration completes.
 *
 * @template T - The state value type
 *
 * @param initialValue - Value to use during SSR and initial hydration (must match server render)
 * @param asyncInit - Optional async function to compute client-specific value
 *
 * @returns Tuple of [state, setState] similar to useState
 *
 * @example
 * ```typescript
 * // Basic usage - prevent hydration mismatch from window check
 * const [isDarkMode] = useHydrationSafeState(false);
 * // During SSR and first client render: false
 * // After hydration: stays false (no asyncInit provided)
 *
 * @example
 * ```typescript
 * // With async initialization
 * const [theme] = useHydrationSafeState(
 *   'light', // SSR value matches server
 *   async () => {
 *     // This runs on client only, after hydration
 *     const saved = await localStorage.getItem('theme');
 *     return saved || 'light';
 *   }
 * );
 *
 * @example
 * ```typescript
 * // With state updates
 * const [isOnline, setIsOnline] = useHydrationSafeState(true);
 * useEffect(() => {
 *   const handleOnline = () => setIsOnline(true);
 *   const handleOffline = () => setIsOnline(false);
 *   window.addEventListener('online', handleOnline);
 *   window.addEventListener('offline', handleOffline);
 *   return () => {
 *     window.removeEventListener('online', handleOnline);
 *     window.removeEventListener('offline', handleOffline);
 *   };
 * }, []);
 * return <p>Status: {isOnline ? 'Online' : 'Offline'}</p>;
 * ```
 */
export function useHydrationSafeState<T>(
  initialValue: T,
  asyncInit?: () => Promise<T>,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(initialValue);
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (hasHydratedRef.current) {
      return;
    }

    hasHydratedRef.current = true;

    if (!asyncInit) {
      return;
    }

    const initializeState = async () => {
      try {
        const value = await asyncInit();
        setState(value);
      } catch (error) {
        console.error('useHydrationSafeState: asyncInit failed', error);
      }
    };

    initializeState();
  }, [asyncInit]);

  return [state, setState];
}
