import { redirect } from "next/navigation";

export default function LoginPage() {
  // 以前のログイン画面のURLを開いた場合も、そのまま業務画面へ案内する。
  redirect("/");
}
