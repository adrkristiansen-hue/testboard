import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./LoginForm";
import { readSsoConfig } from "@/lib/sso";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const user = await getCurrentUser();
  const { next, error } = await searchParams;
  if (user) redirect(next && next.startsWith("/") ? next : "/");
  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <LoginForm next={next ?? "/"} microsoft={!!readSsoConfig(process.env)} ssoError={error && /^sso_[a-z]+$/.test(error) ? error : undefined} />
    </main>
  );
}
