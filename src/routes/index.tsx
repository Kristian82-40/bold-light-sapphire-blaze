import { createFileRoute } from "@tanstack/react-router";
import { CauceDesk } from "@/components/cauce-desk";
import { fetchPools } from "@/lib/pools";

export const Route = createFileRoute("/")({
  loader: () => fetchPools(),
  component: Home,
});

function Home() {
  const initial = Route.useLoaderData();
  return <CauceDesk initial={initial} />;
}
