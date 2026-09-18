import { redirect } from "next/navigation";

type Props = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function ProviderOrderRedirectPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const query = await searchParams;
  const search = new URLSearchParams({ provider: id });

  if (query.error) {
    search.set("error", query.error);
  }

  redirect(`/lunch?${search.toString()}`);
}
