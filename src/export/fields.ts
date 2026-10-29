export function pickAttributes(
  attributes: Record<string, unknown> | null | undefined,
  fields: string[] | undefined,
): Record<string, unknown> {
  const source = attributes ?? {};
  if (!fields || fields.length === 0) {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) copy[key] = value;
    return copy;
  }
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) picked[field] = source[field];
  }
  return picked;
}

export function exportFilename(
  title: string,
  scope: string,
  extension: string,
  now = new Date(),
): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const safeTitle = slug(title) || "layer";
  const safeScope = slug(scope) || "export";
  const safeExtension = extension.replace(/[^a-z0-9]/gi, "") || "txt";
  return `${safeTitle}-${safeScope}-${stamp}.${safeExtension}`;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
