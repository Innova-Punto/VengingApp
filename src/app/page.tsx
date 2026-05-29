import { redirect } from "next/navigation";

import { getCurrentUser, homeForRoles } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  if (!user.activo) redirect("/login?reason=inactivo");

  redirect(homeForRoles(user.roles));
}
