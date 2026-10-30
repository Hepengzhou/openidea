/**
 * The Services tree host: the root nodes service providers contribute, the
 * selection and expansion, and which provider owns a node.
 */
import { create } from "zustand";
import type { MenuItem } from "@/ui";
import {
  serviceProviders,
  type ServiceItemAction,
  type ServiceProviderContribution,
  type ServiceTreeItem,
} from "@/workbench/contributions";

/** The service view (Services tool window tab) hosting the tree. */
export const SERVICES_TREE_VIEW = "services";

interface TreeState {
  /** Root nodes per provider id (reported by each provider's `useRoots`). */
  roots: Record<string, ServiceTreeItem[]>;
  /** The lead node: the detail pane shows it, and the Docker actions target it. */
  selectedKey: string | null;
  /** Every selected node; the toolbar's actions run on all of them. */
  selectedKeys: ReadonlySet<string>;
  expanded: Set<string>;
}

export const useServicesTree = create<TreeState>(() => ({
  roots: {},
  selectedKey: null,
  selectedKeys: new Set(),
  expanded: new Set(["docker:default", "docker:default:group:containers"]),
}));

/** Selects `keys`; `lead` (a member, unless null) is the detail pane's node. */
export function selectServiceNodes(keys: Iterable<string>, lead: string | null) {
  const selectedKeys = new Set(keys);
  const selectedKey = lead && selectedKeys.has(lead) ? lead : ([...selectedKeys][0] ?? null);
  useServicesTree.setState({ selectedKeys, selectedKey });
}

/** Keys of nodes asking to start expanded that were shown once (collapsing them then sticks). */
const seenExpanded = new Set<string>();

export function setProviderRoots(provider: string, items: ServiceTreeItem[]) {
  useServicesTree.setState((s) => {
    if (s.roots[provider] === items) return s;
    const fresh: string[] = [];
    const visit = (i: ServiceTreeItem) => {
      if (i.expanded && !seenExpanded.has(i.key)) {
        seenExpanded.add(i.key);
        fresh.push(i.key);
      }
      i.children?.forEach(visit);
    };
    items.forEach(visit);
    const roots = { ...s.roots, [provider]: items };
    return fresh.length ? { roots, expanded: new Set([...s.expanded, ...fresh]) } : { roots };
  });
}

export function clearProviderRoots(provider: string) {
  useServicesTree.setState((s) => {
    if (!(provider in s.roots)) return s;
    const roots = { ...s.roots };
    delete roots[provider];
    return { roots };
  });
}

export interface Located {
  item: ServiceTreeItem;
  provider: string;
}

/** Every node by key, with the provider owning it. */
export function indexTree(roots: Record<string, readonly ServiceTreeItem[]>): Map<string, Located> {
  const out = new Map<string, Located>();
  const visit = (provider: string, item: ServiceTreeItem) => {
    out.set(item.key, { item, provider });
    item.children?.forEach((c) => visit(provider, c));
  };
  for (const [provider, items] of Object.entries(roots)) items.forEach((i) => visit(provider, i));
  return out;
}

/** Roots of all providers, in provider order. */
export function orderedRoots(
  roots: Record<string, readonly ServiceTreeItem[]>,
  providers: readonly ServiceProviderContribution[],
): ServiceTreeItem[] {
  return providers.flatMap((p) => roots[p.id] ?? []);
}

/** Keys of every expandable node (Expand All). */
export function expandableKeys(items: readonly ServiceTreeItem[]): string[] {
  const out: string[] = [];
  const visit = (i: ServiceTreeItem) => {
    if (i.children?.length) {
      out.push(i.key);
      i.children.forEach(visit);
    }
  };
  items.forEach(visit);
  return out;
}

/**
 * The selected nodes of `provider`, in selection order: the toolbar's buttons act on them.
 */
export function selectedItemsOf(
  provider: string,
  keys: Iterable<string>,
  index: Map<string, Located>,
): ServiceTreeItem[] {
  return [...keys].flatMap((key) => {
    const node = index.get(key);
    return node && node.provider === provider ? [node.item] : [];
  });
}

/**
 * The toolbar actions of a selection: the ids every selected node offers, labeled
 * as the first offers them and run on all of them (Stop on several configurations,
 * Start on several containers…).
 */
export function mergeItemActions(
  items: readonly ServiceTreeItem[],
  actionsOf: (item: ServiceTreeItem) => ServiceItemAction[],
): ServiceItemAction[] {
  const perItem = items.map(actionsOf);
  const first = perItem[0];
  if (!first) return [];
  if (perItem.length === 1) return first;
  return first
    .filter((a) => perItem.every((list) => list.some((x) => x.id === a.id)))
    .map((a) => {
      const same = perItem.map((list) => list.find((x) => x.id === a.id)!);
      return {
        ...a,
        disabled: same.some((x) => x.disabled),
        run: () => same.forEach((x) => x.run()),
      };
    });
}

/** The "Add Service" menu: every provider's entries, separated per provider. */
export function addServiceMenu(providers = serviceProviders()): MenuItem[] {
  const groups = providers.map((p) => p.addMenu?.() ?? []).filter((g) => g.length > 0);
  return groups.flatMap((g, i) => (i === 0 ? g : [{ kind: "separator" } as MenuItem, ...g]));
}
