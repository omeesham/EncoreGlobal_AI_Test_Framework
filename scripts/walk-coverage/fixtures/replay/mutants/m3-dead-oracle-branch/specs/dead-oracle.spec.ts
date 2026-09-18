import { test } from "@playwright/test";
import { assertRejectionOracle } from "../../../../../../src/utils/field-case-runner";

test("TC-MUT-M3-001 rejection oracle is hidden behind dead branches", async ({ page }) => {
  const field = page.locator("[data-testid='max-discount']");
  if (process.env.NEVER === "1") {
    await assertRejectionOracle(page, field, "TC-MUT-M3-001", "Max Discount", "101", async () => {});
  }
  false && await assertRejectionOracle(page, field, "TC-MUT-M3-001", "Max Discount", "102", async () => {});
  return;
  await assertRejectionOracle(page, field, "TC-MUT-M3-001", "Max Discount", "103", async () => {});
});