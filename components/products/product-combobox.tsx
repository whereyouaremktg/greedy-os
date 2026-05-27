"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
};

export function ProductCombobox({
  products,
  value,
  onChange,
  disabled,
}: {
  products: ProductOption[];
  value: string | null;
  onChange: (productId: string | null, productName: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  const selected =
    value && value.length > 0
      ? products.find((p) => p.id === value)
      : undefined;

  const label = selected
    ? selected.sku
      ? `${selected.name} (${selected.sku})`
      : selected.name
    : "None / free text";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name or SKU…" />
          <CommandList>
            <CommandEmpty>No product found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="none free text"
                onSelect={() => {
                  onChange(null, null);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 size-4",
                    !value ? "opacity-100" : "opacity-0",
                  )}
                />
                None / free text
              </CommandItem>
              {products.map((product) => {
                const searchValue = product.sku
                  ? `${product.name} ${product.sku}`
                  : product.name;
                return (
                  <CommandItem
                    key={product.id}
                    value={searchValue}
                    onSelect={() => {
                      onChange(product.id, product.name);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        value === product.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{product.name}</span>
                    {product.sku ? (
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {product.sku}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
