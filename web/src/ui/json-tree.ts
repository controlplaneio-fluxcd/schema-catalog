// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { text } from "./dom.ts";

/**
 * Renders a JSON Schema document as a collapsible, schema-aware tree.
 * Property names listed in their parent schema's `required` array carry the
 * same red marker as the fields index, `type`/`format` values take the accent,
 * `enum` values the constraint tint, and descriptions render as muted prose
 * with their original line breaks. Primitive arrays (enums, required lists)
 * render inline and wrap instead of truncating. Branch children populate
 * lazily on first expand so megabyte-scale schemas (Pod is ~900 kB) stay
 * responsive.
 */
export function createJsonTree(value: unknown): HTMLElement {
  const tree = document.createElement("div");
  tree.className = "json-tree";
  // The document's own keys render at the top level (no wrapping root node),
  // with `properties.spec.properties` pre-expanded: that is where a schema
  // reader lands.
  if (isRecord(value)) {
    appendSchemaEntries(tree, value, ["properties", "spec", "properties"]);
  } else {
    tree.append(createNode(null, value, { open: true }));
  }
  return tree;
}

interface NodeContext {
  /** Expand this node immediately instead of on first toggle. */
  open?: boolean;
  /** The node is a property its parent schema lists as required. */
  required?: boolean;
  /** Chain of descendant keys to pre-expand once this node populates. */
  openPath?: string[];
  /** Required property names for a `properties` child of a schema object. */
  childRequired?: Set<string>;
  /** Inside an `x-kubernetes-validations` entry: rules are CEL, messages prose. */
  validation?: boolean;
}

function createNode(key: string | null, value: unknown, ctx: NodeContext): HTMLElement {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return createLeaf(key, ctx, text("span", "json-punct", "[]"));
    }
    if (value.every(isPrimitive)) {
      return createLeaf(key, ctx, createInlineArray(key, value));
    }
    const count = `${value.length} ${value.length === 1 ? "item" : "items"}`;
    const validation = ctx.validation === true || key === "x-kubernetes-validations";
    return createBranch(key, ctx, count, (children) => {
      value.forEach((item, index) => {
        children.append(createNode(String(index), item, { validation }));
      });
    });
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return createLeaf(key, ctx, text("span", "json-punct", "{}"));
    }
    const count = `${entries.length} ${entries.length === 1 ? "key" : "keys"}`;
    return createBranch(key, ctx, count, (children) => {
      appendSchemaEntries(children, value, ctx.openPath, ctx.childRequired, ctx.validation);
    });
  }
  return createLeaf(key, ctx, createPrimitive(value, valueClass(key, ctx.validation)));
}

/**
 * Renders a schema object's entries: the object's own `required` list marks
 * the children of its `properties` map, so nested schemas (items, defs) keep
 * their markers without global bookkeeping.
 */
function appendSchemaEntries(
  parent: HTMLElement,
  value: Record<string, unknown>,
  openPath?: string[],
  required?: Set<string>,
  validation?: boolean,
): void {
  const childRequired = stringSet(value["required"]);
  for (const [key, child] of Object.entries(value)) {
    const opens = openPath !== undefined && openPath[0] === key;
    parent.append(
      createNode(key, child, {
        open: opens,
        openPath: opens ? openPath.slice(1) : undefined,
        required: required?.has(key) ?? false,
        childRequired: key === "properties" ? childRequired : undefined,
        validation,
      }),
    );
  }
}

function createBranch(key: string | null, ctx: NodeContext, count: string, populateChildren: (children: HTMLElement) => void): HTMLElement {
  const details = document.createElement("details");
  details.className = "json-node";

  const summary = document.createElement("summary");
  summary.append(text("span", "details-marker", "›"));
  if (key !== null) {
    summary.append(text("span", "json-key", key));
  }
  if (ctx.required === true) {
    summary.append(text("span", "constraint-marker constraint-required", "required"));
  }
  summary.append(text("span", "json-count", count));
  details.append(summary);

  const children = document.createElement("div");
  children.className = "json-children";
  details.append(children);

  let populated = false;
  const populate = (): void => {
    if (populated) {
      return;
    }
    populated = true;
    populateChildren(children);
  };

  details.addEventListener("toggle", () => {
    if (details.open) {
      populate();
    }
  });

  if (ctx.open === true) {
    details.open = true;
    populate();
  }
  return details;
}

function createLeaf(key: string | null, ctx: NodeContext, value: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "json-row";
  if (key !== null) {
    row.append(text("span", "json-key", key));
  }
  if (ctx.required === true) {
    row.append(text("span", "constraint-marker constraint-required", "required"));
  }
  row.append(value);
  return row;
}

function createInlineArray(key: string | null, values: unknown[]): HTMLElement {
  const span = document.createElement("span");
  span.className = "json-array";
  const itemClass = key === "enum" ? "json-enum" : key === "required" ? "json-required" : undefined;
  span.append(text("span", "json-punct", "["));
  values.forEach((item, index) => {
    if (index > 0) {
      span.append(text("span", "json-punct", ", "));
    }
    span.append(createPrimitive(item, itemClass));
  });
  span.append(text("span", "json-punct", "]"));
  return span;
}

/** Schema keywords whose values read better in dedicated colors. */
function valueClass(key: string | null, validation = false): string | undefined {
  if (validation && (key === "rule" || key === "messageExpression")) {
    return "json-cel";
  }
  if (validation && key === "message") {
    return "json-prose";
  }
  if (key === "description") {
    return "json-prose";
  }
  if (key === "type" || key === "format") {
    return "json-type";
  }
  return undefined;
}

function createPrimitive(value: unknown, override?: string): HTMLElement {
  const withOverride = (base: string): string => (override === undefined ? base : `${base} ${override}`);
  if (typeof value === "string") {
    return text("span", withOverride("json-string"), value === "" ? '""' : value);
  }
  if (typeof value === "number") {
    return text("span", withOverride("json-number"), String(value));
  }
  if (typeof value === "boolean") {
    return text("span", withOverride("json-bool"), String(value));
  }
  return text("span", withOverride("json-null"), "null");
}

function stringSet(value: unknown): Set<string> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const names = value.filter((item): item is string => typeof item === "string");
  return names.length === 0 ? undefined : new Set(names);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== "object";
}
