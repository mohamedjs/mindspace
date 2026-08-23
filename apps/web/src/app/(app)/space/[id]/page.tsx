import { Suspense, use } from 'react';
import { HomeScreen } from '@/features/home/HomeScreen';

export default function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <HomeScreen spaceId={id} />
    </Suspense>
  );
}
