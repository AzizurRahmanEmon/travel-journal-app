import { passwordRules, passwordStrength } from "@/lib/validators/password";

const bars = {
  Weak: "bg-red-600",
  Fair: "bg-amber-500",
  Good: "bg-lime-600",
  Strong: "bg-green-700",
};

export function PasswordStrength({ password }: { password: string }) {
  const score = passwordStrength(password);

  return (
    <div className="grid gap-2">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-zinc-200"
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={score.total}
        aria-valuenow={score.passed}
        aria-valuetext={score.label}
      >
        <div
          className={`h-full ${bars[score.label]}`}
          style={{ width: `${(score.passed / score.total) * 100}%` }}
        />
      </div>
      <p className="text-xs font-medium text-zinc-700">{score.label}</p>
      <ul className="grid gap-1">
        {passwordRules.map((rule) => (
          <Rule key={rule.id} label={rule.label} passed={rule.test(password)} />
        ))}
      </ul>
    </div>
  );
}

function Rule({ label, passed }: { label: string; passed: boolean }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className={passed ? "text-green-700" : "text-red-600"} aria-hidden="true">
        {passed ? "✓" : "×"}
      </span>
      <span className={passed ? "text-zinc-800" : "text-zinc-500"}>{label}</span>
    </li>
  );
}
