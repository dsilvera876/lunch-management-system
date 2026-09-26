import { redirect } from "next/navigation";

export default function OfficeLocationDetailRedirect() {
  redirect("/admin/locations");
}
