import { Resend } from "resend";
import { env } from "@/lib/env";

export async function sendVerificationEmail(to: string, link: string): Promise<void> {
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject: "Verify your email",
    text: [
      "Confirm your email address for Travel Journal.",
      "",
      "Open this link to verify your account. It expires in 24 hours.",
      link,
      "",
      "If you did not create an account, you can ignore this email.",
    ].join("\n"),
  });

  if (error) {
    throw new Error(error.message);
  }
}
