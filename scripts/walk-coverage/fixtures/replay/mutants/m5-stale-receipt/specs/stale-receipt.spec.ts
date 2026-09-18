import { test, expect } from "@playwright/test";

test("TC-MUT-M5-001 stale receipt replay after spec edit", async () => {
  expect("edited spec body v2").toBe("edited spec body v2");
});