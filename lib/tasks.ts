import fs from "node:fs";
import path from "node:path";

// /tasks フォルダにある業務（1業務＝1フォルダ）を読み込む
// フォルダを追加するだけで業務を増やせる

export type TaskInput = {
  id: string;
  label: string;
  file: string; // サンプルデータのファイル名（Claude側でもこの名前で扱う）
  description: string;
};

export type TaskDefinition = {
  id: string; // フォルダ名
  name: string;
  mode: "journal" | "general";
  summary: string;
  inputs: TaskInput[];
  instructionPlaceholder: string;
  manual: string;
  samples: Record<string, string>; // 入力ID → サンプルCSVの中身
};

const TASKS_DIR = path.join(process.cwd(), "tasks");

function loadTask(id: string): TaskDefinition {
  const dir = path.join(TASKS_DIR, id);
  const config = JSON.parse(fs.readFileSync(path.join(dir, "task.json"), "utf8"));
  const inputs: TaskInput[] = config.inputs ?? [];
  const samples: Record<string, string> = {};
  for (const input of inputs) {
    const samplePath = path.join(dir, "samples", input.file);
    samples[input.id] = fs.existsSync(samplePath) ? fs.readFileSync(samplePath, "utf8") : "";
  }
  return {
    id,
    name: config.name ?? id,
    mode: config.mode === "general" ? "general" : "journal",
    summary: config.summary ?? "",
    inputs,
    instructionPlaceholder: config.instructionPlaceholder ?? "",
    manual: fs.readFileSync(path.join(dir, "manual.md"), "utf8").trim(),
    samples,
  };
}

// フォルダ名の順（01-, 02- …）に並べる。task.json がないフォルダは無視する
export function loadTasks(): TaskDefinition[] {
  return fs
  .readdirSync(TASKS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(TASKS_DIR, d.name, "task.json")))
  .map((d) => d.name)
  .sort()
  .map(loadTask);
}

export const tasks = loadTasks();

export function findTask(id: string): TaskDefinition | undefined {
  return tasks.find((t) => t.id === id);
}
