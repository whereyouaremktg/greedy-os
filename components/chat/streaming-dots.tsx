export function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 px-3 py-2" aria-label="Analyst is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1 rounded-full bg-muted-foreground/50 animate-pulse"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
