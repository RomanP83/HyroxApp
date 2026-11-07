import { WeekScreen } from "./WeekScreen";

export const dynamic = "force-dynamic";

// Plan → Week: the whole week, one line a day. ?week=N pages through the cycle.
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  // Next 15: searchParams arrive as a promise.
  const wantedWeek = (await searchParams).week;
  return <WeekScreen view="week" wantedWeek={wantedWeek} />;
}
