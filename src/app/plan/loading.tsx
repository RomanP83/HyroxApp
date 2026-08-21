// Perceived speed (#6): the week view streams in behind a skeleton that
// mirrors its real layout, so the page never feels like it's thinking.
export default function PlanLoading() {
  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="skeleton h-7 w-28" />
        <div className="skeleton h-9 w-64" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="skeleton h-8 w-full" />
          <div className="skeleton h-24 w-full" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28 w-full" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-32 w-full" />
          <div className="skeleton h-40 w-full" />
        </div>
      </div>
    </main>
  );
}
