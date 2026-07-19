export default function ProgressLoading() {
  return (
    <main className="space-y-6">
      <div className="skeleton h-6 w-32" />
      <div className="skeleton h-8 w-40" />
      <div className="grid gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 w-full" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-56 w-full" />
      ))}
    </main>
  );
}
