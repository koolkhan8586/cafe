import { redirect } from "next/navigation";
import { currentUser, homeForRole } from "@/lib/auth";
import { isRole } from "@/lib/types";

export default async function RootPage() {
  const user = await currentUser();
  if (!user || !isRole(user.role)) redirect("/login");
  redirect(homeForRole(user.role));
}
