import ClientPlayer from './ClientPlayer';

export const dynamic = 'force-dynamic';

export default async function WatchPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string; season?: string; episode?: string }>;
}) {
  const params = await searchParams;
  
  return (
      <ClientPlayer
      type={params?.type}
      id={params?.id}
      season={params?.season}
      episode={params?.episode}
      />
  );
}