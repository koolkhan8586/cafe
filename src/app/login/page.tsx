import { redirect } from "next/navigation";
import { currentUser, homeForRole } from "@/lib/auth";
import { HR_SSO_FAIL_MESSAGE, type HrSsoFail } from "@/lib/hr-sso";
import { getSettings } from "@/lib/settings";
import { isRole } from "@/lib/types";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

function ssoError(value: string | undefined): string | null {
  if (!value) return null;
  if (value in HR_SSO_FAIL_MESSAGE) {
    return HR_SSO_FAIL_MESSAGE[value as HrSsoFail];
  }
  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; sso?: string }>;
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
            Sign in with your employee ID and PIN, or open Cafe from the HR
            panel.
          </p>
        </div>
        <LoginForm next={params.next} initialError={ssoError(params.sso)} />
      </div>
    </div>
  );
}
