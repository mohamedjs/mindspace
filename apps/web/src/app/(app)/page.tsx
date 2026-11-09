'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchSpaces } from '@/features/canvas/api/spaces.api';
import { queryKeys } from '@/lib/query-client/keys';
import { useAuth } from '@/providers/AuthProvider';

const LAST_SPACE_KEY = 'mindspace:lastSpaceId';

export default function Page() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { data: spaces, isLoading } = useQuery({
    queryKey: queryKeys.spaces.all,
    queryFn: fetchSpaces,
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/sign-in');
      return;
    }
    if (!user || isLoading) return;
    if (spaces?.length) {
      const savedSpaceId = localStorage.getItem(LAST_SPACE_KEY);
      const exists = spaces.find((s) => s.id === savedSpaceId);
      if (exists) {
        router.replace(`/space/${exists.id}`);
      } else {
        router.replace(`/space/${spaces[0].id}`);
      }
    }
  }, [user, authLoading, spaces, isLoading, router]);

  return (
    <div className="flex flex-1 items-center justify-center min-h-screen bg-canvas">
      <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin border-amber-500" />
    </div>
  );
}
