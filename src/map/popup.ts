import PopupTemplate from "@arcgis/core/PopupTemplate.js";
import type { FieldFormat, PopupFieldConfig } from "../config/types.ts";

export function buildPopupTemplate(title: string, fields: PopupFieldConfig[]): PopupTemplate {
  return new PopupTemplate({
    title,
    content: [
      {
        type: "fields",
        fieldInfos: fields.map((field) => ({
          fieldName: field.field,
          label: field.label || field.field,
          format: popupFormat(field.format),
        })),
      },
    ],
  });
}

function popupFormat(format: FieldFormat | undefined): __esri.FieldInfoFormat | undefined {
  if (format === "number")
    return { digitSeparator: true, places: 0 } as unknown as __esri.FieldInfoFormat;
  if (format === "number-2")
    return { digitSeparator: true, places: 2 } as unknown as __esri.FieldInfoFormat;
  if (format === "date") return { dateFormat: "short-date" } as unknown as __esri.FieldInfoFormat;
  return undefined;
}
