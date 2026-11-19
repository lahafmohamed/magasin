import { useMediaQuery } from '@/components/useMediaQuery';

/**
 * Vrai quand le système demande de réduire les animations. Les animations de
 * recharts sont en JavaScript : elles ignorent le CSS `prefers-reduced-motion`,
 * d'où `isAnimationActive={!reduceMotion}` sur chaque série. Suit le réglage
 * en direct ; faux sans `matchMedia` (tests jsdom).
 */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)', false);
}
