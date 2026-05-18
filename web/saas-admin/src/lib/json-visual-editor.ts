export type JSONValue =
  | null
  | string
  | number
  | boolean
  | JSONValue[]
  | { [key: string]: JSONValue };

export type JSONPath = Array<string | number>;

export type JSONValueType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "object"
  | "array";

export interface ParsedJSONText {
  value: JSONValue | null;
  error: string | null;
}

export function parseJSONText(text: string): ParsedJSONText {
  try {
    return { value: coerceJSONValue(JSON.parse(text.trim() || "{}")), error: null };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : "JSON invalido",
    };
  }
}

export function formatVisualJSON(value: JSONValue): string {
  return JSON.stringify(value, null, 2);
}

export function createJSONValue(type: JSONValueType): JSONValue {
  switch (type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    case "object":
      return {};
    case "array":
      return [];
  }
}

export function getJSONValueType(value: JSONValue): JSONValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

export function setJSONValueAtPath(
  root: JSONValue,
  path: JSONPath,
  nextValue: JSONValue,
): JSONValue {
  if (path.length === 0) return nextValue;
  const [head, ...tail] = path;

  if (Array.isArray(root) && typeof head === "number") {
    return root.map((item, index) =>
      index === head ? setJSONValueAtPath(item, tail, nextValue) : item,
    );
  }

  if (isJSONObject(root) && typeof head === "string") {
    return {
      ...root,
      [head]: setJSONValueAtPath(root[head] ?? null, tail, nextValue),
    };
  }

  return root;
}

export function deleteJSONValueAtPath(root: JSONValue, path: JSONPath): JSONValue {
  if (path.length === 0) return root;
  const [head, ...tail] = path;

  if (path.length === 1) {
    if (Array.isArray(root) && typeof head === "number") {
      return root.filter((_, index) => index !== head);
    }
    if (isJSONObject(root) && typeof head === "string") {
      const next = { ...root };
      delete next[head];
      return next;
    }
    return root;
  }

  if (Array.isArray(root) && typeof head === "number") {
    return root.map((item, index) =>
      index === head ? deleteJSONValueAtPath(item, tail) : item,
    );
  }

  if (isJSONObject(root) && typeof head === "string") {
    return {
      ...root,
      [head]: deleteJSONValueAtPath(root[head] ?? null, tail),
    };
  }

  return root;
}

export function addJSONObjectProperty(
  root: JSONValue,
  path: JSONPath,
  key: string,
  type: JSONValueType,
): { value: JSONValue; error: string | null } {
  const cleanKey = key.trim();
  if (!cleanKey) return { value: root, error: "Informe uma chave" };

  const target = getJSONValueAtPath(root, path);
  if (!isJSONObject(target)) {
    return { value: root, error: "Este item nao e um objeto" };
  }
  if (Object.prototype.hasOwnProperty.call(target, cleanKey)) {
    return { value: root, error: "Esta chave ja existe" };
  }

  return {
    value: setJSONValueAtPath(root, path, {
      ...target,
      [cleanKey]: createJSONValue(type),
    }),
    error: null,
  };
}

export function appendJSONArrayItem(
  root: JSONValue,
  path: JSONPath,
  type: JSONValueType,
): { value: JSONValue; error: string | null } {
  const target = getJSONValueAtPath(root, path);
  if (!Array.isArray(target)) {
    return { value: root, error: "Este item nao e uma lista" };
  }
  return {
    value: setJSONValueAtPath(root, path, [...target, createJSONValue(type)]),
    error: null,
  };
}

export function getJSONValueAtPath(
  root: JSONValue,
  path: JSONPath,
): JSONValue | undefined {
  return path.reduce<JSONValue | undefined>((current, segment) => {
    if (current === undefined) return undefined;
    if (Array.isArray(current) && typeof segment === "number") return current[segment];
    if (isJSONObject(current) && typeof segment === "string") return current[segment];
    return undefined;
  }, root);
}

export function parseJSONScalar(
  text: string,
  type: "string" | "number" | "boolean",
): { value: JSONValue; error: string | null } {
  if (type === "string") return { value: text, error: null };
  if (type === "boolean") return { value: text === "true", error: null };

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    return { value: 0, error: "Numero invalido" };
  }
  return { value: parsed, error: null };
}

function isJSONObject(value: JSONValue | undefined): value is { [key: string]: JSONValue } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function coerceJSONValue(value: unknown): JSONValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => coerceJSONValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        coerceJSONValue(item),
      ]),
    );
  }

  return null;
}
