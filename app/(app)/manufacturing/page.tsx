export default function ManufacturingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Manufacturing</h1>
        <p className="text-sm text-muted-foreground">
          Production runs by stage: ordered → in production → complete → in
          transit → received. Coming in Phase 1.
        </p>
      </div>
      <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
        Phase 1.4 builds the run pipeline board.
      </div>
    </div>
  );
}
