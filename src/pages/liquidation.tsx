/**
 * Redirect /liquidation → /dashboard?view=liquidation for short links and bookmarks.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function LiquidationRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    void router.replace('/dashboard?view=liquidation');
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 text-base-content/70">
      Opening Liquidation...
    </div>
  );
}
