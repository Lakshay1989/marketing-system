import { describe, expect, it } from "vitest";
import { loadPlaybook, playbookPrompt } from "@/lib/agents/playbook";
import { strategyPrompt, loadCatalog } from "@/lib/agents/strategy";

describe("reel playbook", () => {
  it("loads the shipped playbook and puts it in the strategy prompt", () => {
    const p = loadPlaybook();
    expect(p).not.toBeNull();
    const prompt = strategyPrompt([], loadCatalog().products.slice(0, 5), [], 6);
    expect(prompt).toContain("LEARNED FROM TOP INSTAGRAM PET REELS");
    expect(prompt).toContain("relatable-identity");
  });
  it("flags an old playbook and tolerates a missing one", () => {
    const p = loadPlaybook()!;
    expect(playbookPrompt(p, new Date("2027-03-01"))).toContain("this list is old");
    expect(playbookPrompt(null)).toBe("");
    expect(loadPlaybook("/nonexistent/playbook.json")).toBeNull();
  });
});
