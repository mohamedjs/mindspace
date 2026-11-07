import { Suspense, use } from 'react';
import { HomeScreen } from '@/features/home/HomeScreen';

export default function SpaceMindMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <HomeScreen spaceId={id} initialView="mindmap" />
    </Suspense>
  );
}
