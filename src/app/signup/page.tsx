import { AuthLayout } from "@/components/auth-layout";
import { SignupWorkspace } from "@/components/auth/signup-workspace";

type Props = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <AuthLayout>
      <SignupWorkspace initialError={params.error} initialMessage={params.message} />
    </AuthLayout>
  );
}
