"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  FileText,
  Factory,
  Megaphone,
  Building2,
  Package,
  LogOut,
  Moon,
  Sun,
  Plus,
  FileUp,
  Settings,
  CalendarRange,
  Sparkles,
} from "lucide-react";
import { useAnalystDrawerOptional } from "@/components/chat/analyst-drawer";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { searchGlobal } from "@/lib/actions/search";
import {
  SEARCH_MIN_LENGTH,
  type GlobalSearchResults,
  type SearchResultItem,
} from "@/lib/search/types";

const PAGES = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/purchase-orders", label: "Purchase Orders", icon: FileText },
  { href: "/manufacturing", label: "Manufacturing", icon: Factory },
  { href: "/timeline", label: "Timeline", icon: CalendarRange },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/vendors", label: "Vendors", icon: Building2 },
  { href: "/products", label: "Products", icon: Package },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const SEARCH_DEBOUNCE_MS = 250;

const EMPTY_RESULTS: GlobalSearchResults = {
  purchaseOrders: [],
  vendors: [],
  products: [],
  runs: [],
  campaigns: [],
};

const RESULT_GROUPS: {
  key: keyof GlobalSearchResults;
  heading: string;
  icon: typeof FileText;
}[] = [
  { key: "purchaseOrders", heading: "Purchase Orders", icon: FileText },
  { key: "vendors", heading: "Vendors", icon: Building2 },
  { key: "products", heading: "Products", icon: Package },
  { key: "runs", heading: "Manufacturing Runs", icon: Factory },
  { key: "campaigns", heading: "Campaigns", icon: Megaphone },
];

type CommandPaletteContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const CommandPaletteContext =
  createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  }
  return ctx;
}

function matchesQuery(label: string, query: string): boolean {
  return label.toLowerCase().includes(query.trim().toLowerCase());
}

function useGlobalSearch(query: string, enabled: boolean) {
  const [results, setResults] = useState<GlobalSearchResults>(EMPTY_RESULTS);
  const [searching, setSearching] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!enabled || trimmed.length < SEARCH_MIN_LENGTH) {
      requestIdRef.current += 1;
      return;
    }

    const requestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      const result = await searchGlobal(trimmed).catch(
        () => ({ ok: false as const, error: "Search failed" }),
      );
      if (requestIdRef.current !== requestId) return;
      setSearching(false);
      setResults(result.ok ? result.data : EMPTY_RESULTS);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, enabled]);

  return { results, searching, setSearching };
}

function CommandPaletteDialog() {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const analystDrawer = useAnalystDrawerOptional();
  const [query, setQuery] = useState("");

  const { results, searching, setSearching } = useGlobalSearch(query, open);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        setQuery("");
        setSearching(false);
      }
    },
    [setOpen, setSearching],
  );

  const run = useCallback(
    (fn: () => void) => {
      handleOpenChange(false);
      fn();
    },
    [handleOpenChange],
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      setSearching(value.trim().length >= SEARCH_MIN_LENGTH);
    },
    [setSearching],
  );

  const hasQuery = query.trim().length > 0;
  const searchActive = query.trim().length >= SEARCH_MIN_LENGTH;
  const shownResults = searchActive ? results : EMPTY_RESULTS;
  const pages = hasQuery
    ? PAGES.filter((p) => matchesQuery(p.label, query))
    : PAGES;

  const resultGroups = RESULT_GROUPS.map((group) => ({
    ...group,
    items: shownResults[group.key],
  })).filter((group) => group.items.length > 0);
  const hasResults = resultGroups.length > 0;

  const actions: {
    value: string;
    icon: React.ReactNode;
    label: React.ReactNode;
    shortcut?: string;
    onSelect: () => void;
  }[] = [
    {
      value: "Create product",
      icon: <Plus className="size-4 text-muted-foreground" />,
      label: "Create product",
      onSelect: () => run(() => router.push("/products?new=1")),
    },
    {
      value: "Create vendor",
      icon: <Plus className="size-4 text-muted-foreground" />,
      label: "Create vendor",
      onSelect: () => run(() => router.push("/vendors?new=1")),
    },
    {
      value: "Create purchase order",
      icon: <Plus className="size-4 text-muted-foreground" />,
      label: "Create purchase order",
      onSelect: () => run(() => router.push("/purchase-orders?new=1")),
    },
    {
      value: "Create run",
      icon: <Plus className="size-4 text-muted-foreground" />,
      label: "Create run",
      onSelect: () => run(() => router.push("/manufacturing?new=1")),
    },
    {
      value: "Upload factory proforma",
      icon: <FileUp className="size-4 text-muted-foreground" />,
      label: "Upload factory proforma",
      onSelect: () => run(() => router.push("/manufacturing?upload=1")),
    },
    {
      value: "Create campaign",
      icon: <Plus className="size-4 text-muted-foreground" />,
      label: "Create campaign",
      onSelect: () => run(() => router.push("/campaigns?new=1")),
    },
    ...(analystDrawer
      ? [
          {
            value: "Ask analyst",
            icon: <Sparkles className="size-4 text-muted-foreground" />,
            label: "Ask analyst",
            shortcut: "⌘J",
            onSelect: () => run(() => analystDrawer.setOpen(true)),
          },
        ]
      : []),
    {
      value: "Toggle theme",
      icon:
        resolvedTheme === "dark" ? (
          <Sun className="size-4 text-muted-foreground" />
        ) : (
          <Moon className="size-4 text-muted-foreground" />
        ),
      label: "Toggle theme",
      shortcut: "T",
      onSelect: () =>
        run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark")),
    },
    {
      value: "Sign out",
      icon: <LogOut className="size-4 text-muted-foreground" />,
      label: "Sign out",
      onSelect: () => {
        handleOpenChange(false);
        const form = document.getElementById(
          "sidebar-signout",
        ) as HTMLFormElement | null;
        form?.requestSubmit();
      },
    },
  ];
  const visibleActions = hasQuery
    ? actions.filter((a) => matchesQuery(a.value, query))
    : actions;

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Search POs, vendors, products, runs, campaigns…"
        value={query}
        onValueChange={handleQueryChange}
      />
      <CommandList>
        {searching ? (
          <CommandLoading>Searching…</CommandLoading>
        ) : (
          <CommandEmpty>No results found.</CommandEmpty>
        )}
        {resultGroups.map(({ key, heading, icon: Icon, items }) => (
          <CommandGroup key={key} heading={heading}>
            {items.map((item: SearchResultItem) => (
              <CommandItem
                key={`${key}:${item.id}`}
                value={`${key}:${item.id}`}
                onSelect={() => run(() => router.push(item.href))}
              >
                <Icon className="size-4 text-muted-foreground" />
                <span className="truncate">{item.title}</span>
                {item.subtitle ? (
                  <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">
                    {item.subtitle}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {hasResults && (pages.length > 0 || visibleActions.length > 0) ? (
          <CommandSeparator alwaysRender />
        ) : null}
        {pages.length > 0 ? (
          <CommandGroup heading="Pages">
            {pages.map(({ href, label, icon: Icon }) => (
              <CommandItem
                key={href}
                value={label}
                onSelect={() => run(() => router.push(href))}
              >
                <Icon className="size-4 text-muted-foreground" />
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {pages.length > 0 && visibleActions.length > 0 ? (
          <CommandSeparator alwaysRender />
        ) : null}
        {visibleActions.length > 0 ? (
          <CommandGroup heading="Actions">
            {visibleActions.map((action) => (
              <CommandItem
                key={action.value}
                value={action.value}
                onSelect={action.onSelect}
              >
                {action.icon}
                {action.label}
                {action.shortcut ? (
                  <CommandShortcut>{action.shortcut}</CommandShortcut>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const value = useMemo(
    () => ({ open, setOpen, toggle }),
    [open, toggle],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPaletteDialog />
    </CommandPaletteContext.Provider>
  );
}
