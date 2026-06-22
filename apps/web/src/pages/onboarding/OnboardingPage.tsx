import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCompleteOnboarding } from "../../hooks/use-user-profile";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { mutate } = useCompleteOnboarding();

  const [jobRole, setJobRole] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [primaryUseCase, setPrimaryUseCase] = useState("");

  const isValid =
    jobRole.trim().length > 0 &&
    companySize.trim().length > 0 &&
    primaryUseCase.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    mutate(
      {
        job_role: jobRole.trim(),
        company_size: companySize.trim(),
        primary_use_case: primaryUseCase.trim(),
      },
      {
        onSuccess: () => {
          navigate("/");
        },
      },
    );
  }

  return (
    <main>
      <h1>Welcome! Tell us about yourself</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="job_role">Job Role</label>
          <input
            id="job_role"
            type="text"
            value={jobRole}
            onChange={(e) => setJobRole(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="company_size">Company Size</label>
          <input
            id="company_size"
            type="text"
            value={companySize}
            onChange={(e) => setCompanySize(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="primary_use_case">Primary Use Case</label>
          <input
            id="primary_use_case"
            type="text"
            value={primaryUseCase}
            onChange={(e) => setPrimaryUseCase(e.target.value)}
          />
        </div>
        <button type="submit" disabled={!isValid}>
          Get Started
        </button>
      </form>
    </main>
  );
}
