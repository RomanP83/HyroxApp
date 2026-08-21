export default function BenchmarksLoading() {
  return (
    <main className="space-y-6">
      <div className="skeleton h-6 w-32" />
      <div className="skeleton h-8 w-48" />
      <div className="skeleton h-24 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-36 w-full" />
        ))}
      </div>
    </main>
  );
}
