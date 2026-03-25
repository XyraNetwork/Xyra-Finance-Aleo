/**
 * Flash loan UI lives on the dashboard (`view=flash`).
 * Redirect /flash → /dashboard?view=flash for short links and bookmarks.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function FlashRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    // Flash is intentionally hidden right now (not part of the current testing flow).
    void router.replace('/dashboard');
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 text-base-content/70">
      Flash loan page is disabled for now. Redirecting…
    </div>
  );
}
