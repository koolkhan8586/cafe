import { redirect } from "next/navigation";
import { currentUser, homeForRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { isRole } from "@/lib/types";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await currentUser();
  if (user && isRole(user.role)) redirect(homeForRole(user.role));

  const [{ CAFE_NAME }, params] = await Promise.all([
    getSettings(),
    searchParams,
  ]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-4xl" aria-hidden>
            ☕
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            {CAFE_NAME}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Sign in with your employee ID and PIN.
          </p>
        </div>
        <LoginForm next={params.next} />
      </div>
    </div>
  );
}
