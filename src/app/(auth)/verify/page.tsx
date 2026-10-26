import { VerifyEmail } from "@/app/(auth)/verify/verify-email";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? (params.token[0] ?? "") : (params.token ?? "");
  return <VerifyEmail token={token} />;
}
