import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">ABT Tournament</h1>
      <p>Web app for running the Agility Badminton Tournament (ABT).</p>
      <Button disabled>Coming soon</Button>
    </main>
  );
}
