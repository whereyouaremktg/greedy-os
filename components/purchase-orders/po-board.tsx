"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Package, Truck } from "lucide-react";
import { toast } from "sonner";

import { updatePoStatus } from "@/lib/actions/purchase-orders";
import {
  formatArrivalDisplay,
  formatDaysToBadge,
  getArrivalPillVariant,
} from "@/lib/manufacturing/dates";
import {
  PO_BOARD_STATUSES,
  PO_STATUS_LABELS,
  poBoardColumn,
  type PoStatus,
} from "@/lib/purchase-orders/statuses";
import { formatUsd } from "@/lib/format";
import type { PoRow } from "@/components/purchase-orders/types";
import { usePrefersReducedMotion } from "@/components/relative-time";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function applyStatusSideEffects(order: PoRow, status: PoStatus): PoRow {
  return { ...order, status };
}

function CancelCallout({
  expectedDate,
  status,
}: {
  expectedDate: string | null;
  status: PoStatus;
}) {
  const done = status === "closed" || status === "received";
  const variant = done ? "neutral" : getArrivalPillVariant(expectedDate, "ordered");
  const hasDate = !!expectedDate;

  return (
    <div
      className={cn(
        "mt-2.5 flex items-center justify-between gap-2 rounded-md border px-2.5 py-2",
        !hasDate && "border-dashed border-border/80 bg-muted/25",
        hasDate &&
          variant === "overdue" &&
          "border-destructive/35 bg-destructive/8",
        hasDate && variant === "soon" && "border-warning/45 bg-warning/12",
        hasDate && variant === "neutral" && "border-brand/25 bg-brand/8",
      )}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Latest cancel
        </p>
        <p
          className={cn(
            "num mt-0.5 truncate text-sm font-semibold tabular-nums leading-tight",
            !hasDate && "font-normal text-muted-foreground",
            hasDate && variant === "overdue" && "text-destructive",
          )}
        >
          {formatArrivalDisplay(expectedDate)}
        </p>
      </div>
      {hasDate && !done ? (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
            variant === "overdue" &&
              "bg-destructive/15 text-destructive dark:bg-destructive/25",
            variant === "soon" &&
              "bg-warning/20 text-warning-foreground dark:text-warning",
            variant === "neutral" &&
              "bg-background/80 text-muted-foreground ring-1 ring-border/60",
          )}
        >
          {formatDaysToBadge(expectedDate)}
        </span>
      ) : null}
    </div>
  );
}

function ShipmentCallout({ order }: { order: PoRow }) {
  const hasTracking = !!order.tracking_number?.trim();
  const hasShipDate = !!order.ship_date;
  const inShippedColumn = poBoardColumn(order.status) === "shipped";

  if (!hasTracking && !hasShipDate && !inShippedColumn) return null;

  return (
    <div
      className={cn(
        "mt-2 flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px]",
        hasTracking
          ? "border-brand/25 bg-brand/8"
          : inShippedColumn
            ? "border-warning/45 bg-warning/12"
            : "border-dashed border-border/80 bg-muted/25",
      )}
    >
      <Truck className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">Shipment</p>
        {hasTracking ? (
          <p className="mt-0.5 truncate text-muted-foreground">
            {[order.carrier, order.tracking_number].filter(Boolean).join(" · ")}
          </p>
        ) : (
          <p className="mt-0.5 text-muted-foreground">Add tracking in details</p>
        )}
        {hasShipDate ? (
          <p className="num mt-0.5 tabular-nums text-muted-foreground">
            Shipped {formatArrivalDisplay(order.ship_date)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PaymentCallout({ order }: { order: PoRow }) {
  const { payments } = order;
  const hasPayments =
    payments.unpaid_count > 0 ||
    payments.all_paid ||
    poBoardColumn(order.status) === "closed";

  if (!hasPayments && payments.unpaid_count === 0 && !payments.all_paid) {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-2 flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-[11px]",
        payments.all_paid
          ? "border-emerald-500/30 bg-emerald-500/8"
          : payments.unpaid_count > 0
            ? "border-warning/45 bg-warning/12"
            : "border-dashed border-border/80 bg-muted/25",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Package className="size-3.5 text-muted-foreground" />
        <span className="font-medium">Payment</span>
      </div>
      {payments.all_paid ? (
        <span className="font-medium text-emerald-700 dark:text-emerald-400">
          Paid
        </span>
      ) : payments.unpaid_count > 0 ? (
        <span className="num font-medium tabular-nums">
          {formatUsd(payments.unpaid_total, 0)} due
        </span>
      ) : (
        <span className="text-muted-foreground">Not logged</span>
      )}
    </div>
  );
}

function PoCardContent({
  order,
  isDragging = false,
}: {
  order: PoRow;
  isDragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 text-left shadow-xs transition-colors",
        "hover:border-brand/40",
        isDragging && "border-brand/50 shadow-sm",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium leading-tight">
            {order.po_number ? `PO ${order.po_number}` : "Purchase order"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {order.vendor_name}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{order.line_item_count} styles</span>
        <span className="num shrink-0">
          {order.total_units.toLocaleString()} units · {formatUsd(order.total, 0)}
        </span>
      </div>
      <CancelCallout expectedDate={order.expected_date} status={order.status} />
      <ShipmentCallout order={order} />
      <PaymentCallout order={order} />
    </div>
  );
}

function DraggablePoCard({
  order,
  onOpen,
  reducedMotion,
}: {
  order: PoRow;
  onOpen: (order: PoRow) => void;
  reducedMotion: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: order.id, data: { order } });

  const style =
    transform && !reducedMotion
      ? {
          transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`,
        }
      : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-40")}
      {...listeners}
      {...attributes}
    >
      <button
        type="button"
        className="w-full cursor-grab text-left active:cursor-grabbing"
        onClick={() => onOpen(order)}
      >
        <PoCardContent order={order} />
      </button>
    </div>
  );
}

function BoardColumn({
  status,
  orders,
  onOpen,
  reducedMotion,
}: {
  status: PoStatus;
  orders: PoRow[];
  onOpen: (order: PoRow) => void;
  reducedMotion: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const totalUnits = orders.reduce((sum, o) => sum + o.total_units, 0);

  return (
    <div className="flex min-w-[220px] flex-1 flex-col lg:min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-medium">{PO_STATUS_LABELS[status]}</h3>
          <Badge variant="secondary" className="num h-5 px-1.5">
            {orders.length}
          </Badge>
        </div>
        <span className="num text-[11px] text-muted-foreground">
          {totalUnits.toLocaleString()} units
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[280px] flex-1 flex-col gap-2 rounded-lg border border-dashed p-2 transition-colors",
          isOver ? "border-brand/50 bg-brand/5" : "border-border/70 bg-muted/20",
        )}
      >
        {orders.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            {PO_STATUS_LABELS[status]} —
          </div>
        ) : (
          orders.map((order) => (
            <DraggablePoCard
              key={order.id}
              order={order}
              onOpen={onOpen}
              reducedMotion={reducedMotion}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function PoBoard({
  orders: ordersProp,
  onOpenOrder,
}: {
  orders: PoRow[];
  onOpenOrder: (order: PoRow) => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [orders, setOrders] = React.useState(ordersProp);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setOrders(ordersProp);
  }, [ordersProp]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor),
  );

  const activeOrder = activeId
    ? orders.find((o) => o.id === activeId) ?? null
    : null;

  const ordersByStatus = React.useMemo(() => {
    const map = Object.fromEntries(
      PO_BOARD_STATUSES.map((s) => [s, [] as PoRow[]]),
    ) as Record<(typeof PO_BOARD_STATUSES)[number], PoRow[]>;

    for (const order of orders) {
      if (order.status === "cancelled" || order.status === "draft") continue;
      const column = poBoardColumn(order.status);
      if (PO_BOARD_STATUSES.includes(column)) {
        map[column].push(order);
      }
    }
    return map;
  }, [orders]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || pending) return;

    const orderId = String(active.id);
    const newStatus = over.id as PoStatus;
    const order = orders.find((o) => o.id === orderId);
    if (!order || poBoardColumn(order.status) === newStatus) return;
    if (!PO_BOARD_STATUSES.includes(newStatus)) return;

    const snapshot = orders;
    const optimistic = orders.map((o) =>
      o.id === orderId ? applyStatusSideEffects(o, newStatus) : o,
    );
    setOrders(optimistic);

    startTransition(async () => {
      const result = await updatePoStatus(orderId, newStatus);
      if (!result.ok) {
        setOrders(snapshot);
        toast.error(result.error);
      }
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="-mx-1 flex gap-3 overflow-x-auto pb-1 lg:mx-0 lg:overflow-visible">
        {PO_BOARD_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            orders={ordersByStatus[status]}
            onOpen={onOpenOrder}
            reducedMotion={reducedMotion}
          />
        ))}
      </div>
      {!reducedMotion ? (
        <DragOverlay dropAnimation={null}>
          {activeOrder ? (
            <div className="w-[220px] rotate-1 opacity-95">
              <PoCardContent order={activeOrder} isDragging />
            </div>
          ) : null}
        </DragOverlay>
      ) : null}
    </DndContext>
  );
}
