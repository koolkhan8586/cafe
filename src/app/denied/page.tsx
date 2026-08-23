import Link from "next/link";
import { buttonPrimary } from "@/components/ui";

export default function DeniedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>
        <div className="text-4xl" aria-hidden>
          🔒
        </div>
        <h1 className="mt-3 text-2xl font-semibold">Not your counter</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Your account does not have access to that page. If you think it should,
          ask the cafe admin to check your role.
        </p>
        <Link href="/" className={`${buttonPrimary} mt-6`}>
          Back to the menu
        </Link>
      </div>
    </div>
  );
}
