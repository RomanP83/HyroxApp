import { WeekScreen } from "../plan/WeekScreen";

export const dynamic = "force-dynamic";

// Today: the screen opened in the gym — the day strip and the day's session.
export default async function TodayPage() {
  return <WeekScreen view="today" />;
}
