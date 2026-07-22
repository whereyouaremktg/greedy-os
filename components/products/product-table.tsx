"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Power,
  PowerOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ProductForm } from "@/components/products/product-form";
import {
  deactivateProduct,
  syncProductsFromShopify,
  updateProduct,
} from "@/lib/actions/products";
import { EmptyState, EmptyStateAction } from "@/components/empty-state";
import { PageHeader } from "@/components/nav/page-header";
import { RelativeTime } from "@/components/relative-time";
import { cn } from "@/lib/utils";

export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  active: boolean;
  image_url: string | null;
  notes: string | null;
  shopify_product_id: string | null;
  shopify_handle: string | null;
  updated_at: string;
  manufacturing_count: number;
};

export function ProductTable({
  products,
  initialCreateOpen = false,
}: {
  products: ProductRow[];
  initialCreateOpen?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(initialCreateOpen);
  const [editing, setEditing] = React.useState<ProductRow | null>(null);
  const [syncPending, startSyncTransition] = React.useTransition();
  const [togglePendingId, setTogglePendingId] = React.useState<string | null>(
    null,
  );
  const [togglePending, startToggleTransition] = React.useTransition();

  const openCreateFromQuery = searchParams.get("new") === "1";
  const createSheetOpen = createOpen || openCreateFromQuery;

  const openIdFromQuery = searchParams.get("open");
  const handledOpenIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!openIdFromQuery) {
      handledOpenIdRef.current = null;
      return;
    }
    if (handledOpenIdRef.current === openIdFromQuery) return;
    const timer = setTimeout(() => {
      handledOpenIdRef.current = openIdFromQuery;
      const product = products.find((p) => p.id === openIdFromQuery);
      if (product) setEditing(product);
      else toast.error("Product not found");
      router.replace("/products");
    }, 0);
    return () => clearTimeout(timer);
  }, [openIdFromQuery, products, router]);

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open);
    if (!open && openCreateFromQuery) {
      router.replace("/products");
    }
  }

  function closeCreateSheet() {
    handleCreateOpenChange(false);
  }

  function handleMutationSuccess(closeSheet: () => void) {
    closeSheet();
    router.refresh();
  }

  function handleSync() {
    startSyncTransition(async () => {
      const result = await syncProductsFromShopify();
      if (result.ok) {
        const suffix =
          result.errors.length > 0
            ? ` (${result.errors.length} skipped)`
            : "";
        toast.success(`Synced ${result.synced} products${suffix}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleToggleActive(product: ProductRow) {
    setTogglePendingId(product.id);
    startToggleTransition(async () => {
      if (product.active) {
        const result = await deactivateProduct(product.id);
        if (result.ok) {
          toast.success(`Deactivated ${product.name}`);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } else {
        const result = await updateProduct(product.id, {
          name: product.name,
          sku: product.sku ?? "",
          category: product.category ?? "",
          unit: product.unit,
          image_url: product.image_url ?? "",
          active: true,
          notes: product.notes ?? "",
        });
        if (result.ok) {
          toast.success(`Reactivated ${product.name}`);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      }
      setTogglePendingId(null);
    });
  }

  return (
    <>
      <PageHeader
        title="Products"
        description="Canonical product catalog for manufacturing and ops."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleSync}
              disabled={syncPending}
            >
              <RefreshCw className={cn(syncPending && "animate-spin")} />
              Sync from Shopify
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              New product
            </Button>
          </div>
        }
      />

      <div className="rounded-md border">
        {products.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Sync from Shopify or click New product to get started."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <EmptyStateAction onClick={handleSync}>
                  Sync from Shopify
                </EmptyStateAction>
                <EmptyStateAction onClick={() => setCreateOpen(true)}>
                  New product
                </EmptyStateAction>
              </div>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Mfg runs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow
                  key={product.id}
                  className={cn(
                    "group cursor-pointer",
                    !product.active && "opacity-50",
                  )}
                  onClick={() => setEditing(product)}
                >
                  <TableCell>
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image_url}
                        alt=""
                        className="size-4 rounded object-cover"
                      />
                    ) : (
                      <span className="inline-block size-4 rounded bg-muted" />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {product.sku ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.category ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {product.manufacturing_count}
                  </TableCell>
                  <TableCell>
                    {product.active ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground text-xs"
                    suppressHydrationWarning
                  >
                    <RelativeTime iso={product.updated_at} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${product.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(product);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={
                          product.active
                            ? `Deactivate ${product.name}`
                            : `Reactivate ${product.name}`
                        }
                        disabled={togglePending && togglePendingId === product.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleActive(product);
                        }}
                      >
                        {product.active ? <PowerOff /> : <Power />}
                      </Button>
                      <Link
                        href="/manufacturing"
                        aria-label={`View runs for ${product.name}`}
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={createSheetOpen} onOpenChange={handleCreateOpenChange}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>New product</SheetTitle>
            <SheetDescription>Add a product to the catalog.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <ProductForm
              onSuccess={() => handleMutationSuccess(closeCreateSheet)}
              onCancel={closeCreateSheet}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>Edit product</SheetTitle>
            <SheetDescription>{editing?.name ?? ""}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {editing ? (
              <ProductForm
                product={editing}
                onSuccess={() => handleMutationSuccess(() => setEditing(null))}
                onCancel={() => setEditing(null)}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
