export const MAX_TASK_FILES = 10;
export const MAX_TASK_FILE_BYTES = 1024 * 1024;
export const MAX_GENERAL_FILES = 15;
export const MAX_GENERAL_FILE_BYTES = 3 * 1024 * 1024;
export const GENERAL_ACCEPT = ".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp";
export const GENERAL_INSTRUCTION_LIMIT = 10_000;
export const GENERAL_FILE_TYPES: Record<string, { mime: string; kind: "data" | "pdf" | "image" }> = {
  csv: { mime: "text/csv", kind: "data" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "data" },
  xls: { mime: "application/vnd.ms-excel", kind: "data" },
  pdf: { mime: "application/pdf", kind: "pdf" },
  png: { mime: "image/png", kind: "image" },
  jpg: { mime: "image/jpeg", kind: "image" },
  jpeg: { mime: "image/jpeg", kind: "image" },
  webp: { mime: "image/webp", kind: "image" },
};
export const fileExtension = (name: string) => name.split(".").pop()?.toLowerCase() || "";
