const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/;

export const QUERY_OPERATORS = [
  { id: "eq", label: "equals" },
  { id: "neq", label: "does not equal" },
  { id: "gt", label: "greater than" },
  { id: "gte", label: "at least" },
  { id: "lt", label: "less than" },
  { id: "lte", label: "at most" },
  { id: "contains", label: "contains" },
  { id: "starts", label: "starts with" },
  { id: "is-null", label: "is empty" },
  { id: "not-null", label: "is not empty" },
] as const;

export type QueryOperator = (typeof QUERY_OPERATORS)[number]["id"];

export type QueryFieldType = "string" | "number" | "date";

export type WhereResult = { ok: true; where: string } | { ok: false; error: string };

export function buildWhereClause(
  field: string,
  operator: QueryOperator,
  value: string,
  fieldType: QueryFieldType,
): WhereResult {
  if (!FIELD_NAME.test(field)) {
    return {
      ok: false,
      error: "Choose a field name made of letters, numbers, underscores, or dots.",
    };
  }
  if (operator === "is-null") return { ok: true, where: `${field} IS NULL` };
  if (operator === "not-null") return { ok: true, where: `${field} IS NOT NULL` };

  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: "Enter a value to query." };

  if (fieldType === "number" && operator !== "contains" && operator !== "starts") {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return { ok: false, error: "Enter a numeric value." };
    return { ok: true, where: `${field} ${sqlOperator(operator)} ${numeric}` };
  }

  if (fieldType === "date" && operator !== "contains" && operator !== "starts") {
    const date = normalizeDateLiteral(trimmed);
    if (!date) return { ok: false, error: "Enter a date as YYYY-MM-DD." };
    return { ok: true, where: `${field} ${sqlOperator(operator)} ${date}` };
  }

  const literal = sqlString(trimmed);
  if (operator === "contains")
    return { ok: true, where: `UPPER(${field}) LIKE UPPER('%${escapeLike(trimmed)}%')` };
  if (operator === "starts")
    return { ok: true, where: `UPPER(${field}) LIKE UPPER('${escapeLike(trimmed)}%')` };
  return { ok: true, where: `${field} ${sqlOperator(operator)} ${literal}` };
}

export function combineWhere(base: string | undefined | null, extra: string): string {
  const left = base?.trim();
  if (!left || left === "1=1") return extra;
  return `(${left}) AND (${extra})`;
}

export function objectIdWhere(objectIdField: string, objectIds: number[]): string {
  if (!FIELD_NAME.test(objectIdField)) {
    throw new Error("The layer object id field is not a safe name.");
  }
  const ids = objectIds.filter((id) => Number.isInteger(id));
  if (ids.length === 0) return "1=0";
  return `${objectIdField} IN (${ids.join(",")})`;
}

function sqlOperator(operator: QueryOperator): string {
  switch (operator) {
    case "eq":
      return "=";
    case "neq":
      return "<>";
    case "gt":
      return ">";
    case "gte":
      return ">=";
    case "lt":
      return "<";
    case "lte":
      return "<=";
    default:
      return "=";
  }
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function escapeLike(value: string): string {
  return value.replaceAll("'", "''");
}

function normalizeDateLiteral(value: string): string | undefined {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `DATE '${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}'`;
  const timestamp = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(value);
  if (!timestamp) return undefined;
  const time = timestamp[2].length === 5 ? `${timestamp[2]}:00` : timestamp[2];
  return `TIMESTAMP '${timestamp[1]} ${time}'`;
}
