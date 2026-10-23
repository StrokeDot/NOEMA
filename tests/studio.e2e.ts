import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
test("authoring, import, search, memory, themes, isolation and reopening", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "+ New writing project" })).toBeVisible();
  const modal = page.getByRole("dialog", { name: "New writing project" });
  if (!(await modal.isVisible())) await page.getByRole("button", { name: "+ New writing project" }).click();
  await page.getByRole("button", { name: "Book project", exact: false }).click();
  await page
    .getByLabel("Book title", { exact: true })
    .fill("26 Reasons Why Jews Should Believe in Jesus");
  await page.getByLabel("Author", { exact: true }).fill("Alejandro Rosillon");
  await page.getByRole("button", { name: "Create writing project" }).click();
  await expect(page.getByRole("dialog",{name:"New writing project"})).toBeHidden();
  await page.getByRole("button", { name: "Manuscript", exact: true }).click();
  await expect(
    page.getByText("Every book begins with a thought."),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept("The unfinished relationship"));
  await page
    .getByRole("button", { name: "Create a chapter", exact: true })
    .click();
  // Tiptap uses contenteditable without an explicit textbox role on some versions.
  const manuscript = page.locator("[contenteditable=true]");
  await expect(manuscript).toBeVisible();
  await manuscript.fill("A book begins with an honest question.");
  await manuscript.press("Control+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(manuscript.locator("strong")).toContainText("honest question");
  await expect(page.getByText("● Saved on this computer")).toBeVisible();
  await page.reload();
  await expect(manuscript).toContainText("honest question");
  await expect(manuscript.locator("strong")).toContainText("honest question");
  // An immediate chapter switch flushes the debounced final edit.
  await manuscript.press("End");
  await manuscript.pressSequentially(" A second thought.");
  page.once("dialog", (dialog) => dialog.accept("Freedom and responsibility"));
  await page.getByRole("button", { name: "Add chapter", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Freedom and responsibility",
      exact: true,
    }),
  ).toBeVisible();
  await manuscript.fill("Moral perfection is the maturation of freedom.");
  await page.getByRole("button", { name: "Book preview", exact: true }).click();
  await expect(page.locator(".preview-chapter")).toHaveCount(2);
  await expect(page.locator(".preview-chapter").first()).toContainText(
    "A second thought.",
  );
  await expect(page.locator(".preview-chapter").last()).toContainText(
    "maturation of freedom",
  );
  await page.getByRole("button", { name: "Book sources", exact: true }).click();
  await page.evaluate(
    (files) => {
      (
        window as unknown as { __NOEMA_TEST_FILES__: string[] }
      ).__NOEMA_TEST_FILES__ = files;
    },
    [resolve("tests/fixtures/research.pdf")],
  );
  await expect(page.getByRole("button",{name:"Upload my own sources"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Upload books & research"})).toBeVisible();
  await page
    .getByRole("button", { name: "+ Attach source files", exact: true })
    .click();
  await expect(
    page.getByText("1 file(s) imported.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", {name:"Use in book"}).click();
  const panel=page.getByRole("dialog", {name:"Source guidance"});
  await panel.getByLabel("Role in the argument").selectOption("Critical Perspective");
  await panel.getByLabel("Instructions for using this source").fill("Review this passage in context.");
  await panel.getByRole("button", {name:"Save source guidance"}).click();
  await expect(page.locator(".source-card")).toContainText("Critical Perspective");
    await page.getByLabel("Search research").fill("responsibility");
  await expect(page.locator(".search-result")).toHaveCount(1);
  await expect(page.locator(".search-result")).toContainText("Page 2");
  await page.locator(".search-result").click();
  await expect(
    page.getByRole("dialog", { name: "Source reader" }),
  ).toContainText("second page considers responsibility");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Project memory", exact: true })
    .click();
  await page.getByRole("button", { name: "+ New memory" }).click();
  await page
    .getByLabel("Category", { exact: true })
    .selectOption("Established Positions");
  await page.getByLabel("Title", { exact: true }).fill("Freedom matures");
  await page
    .getByLabel("Your note")
    .fill("Virtue strengthens the use of freedom.");
  await page
    .getByLabel("Original source (optional)")
    .selectOption({ label: "research.pdf" });
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  await expect(page.locator(".memory-card")).toContainText("Freedom matures");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Your note")
    .fill("Mature freedom remains genuine freedom.");
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  await expect(page.locator(".memory-card")).toContainText("genuine freedom");
  await page.getByRole("button", { name: "Core frameworks", exact: true }).click();
  await page.getByRole("button", { name: "+ New framework" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Responsibility framework");
  await page.getByLabel("Core principles / position document").fill("Individual moral responsibility belongs to the actor.");
  await page.getByLabel("Qualifications, rejected interpretations, and boundaries")
    .fill("This does not imply collective guilt.");
  await page.getByLabel("Review status").selectOption("Confirmed");
  await page.getByRole("button", { name: "Save framework" }).click();
  await expect(page.locator(".gem-card")).toContainText("Responsibility framework");
  // Activation is persisted asynchronously before the controlled checkbox updates.
  await page.getByLabel("Use in this project").click();
  await expect(page.getByLabel("Use in this project")).toBeChecked();
  await expect(page.getByText("1 confirmed framework active")).toBeVisible();
  await page.getByRole("button", { name: "Project memory", exact: true }).click();
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "+ New writing project" }).click();
  await page.getByRole("button", { name: "Book project", exact: false }).click();
  await page
    .getByLabel("Book title", { exact: true })
    .fill("Independent project");
  await page.getByLabel("Author", { exact: true }).fill("Another author");
  await page.getByRole("button", { name: "Create writing project" }).click();
  await expect(page.getByRole("dialog",{name:"New writing project"})).toBeHidden();
  await page.getByLabel("Search research").fill("responsibility");
  await expect(page.getByText("0 passages on this page")).toBeVisible();
  await page
    .getByRole("button", { name: "Project memory", exact: true })
    .click();
  await expect(page.locator(".memory-card")).toHaveCount(0);
  await page
    .getByLabel("Current project")
    .selectOption({ label: "26 Reasons Why Jews Should Believe in Jesus" });
  await expect(manuscript).toContainText("A second thought.");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.getByText("Knowledge that stays.")).toBeVisible();
  await page.screenshot({
    path: "test-results/noema-light.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 720, height: 1000 });
  await expect(page.locator(".research-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Show research", exact: true }).click();
  await expect(page.locator(".research-panel")).toBeVisible();
  await page.getByRole("button", { name: "Close research panel", exact: true }).click();
  await expect(manuscript).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/noema-tablet.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});


test("a narrow window opens with an unobstructed writing workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "+ New writing project" })).toBeVisible();
  const modal = page.getByRole("dialog", { name: "New writing project" });
  if (!(await modal.isVisible())) await page.getByRole("button", { name: "+ New writing project" }).click();
  await modal.getByRole("button", { name: "Book project", exact: false }).click();
  await modal.getByLabel("Book title", { exact: true }).fill("Small-window book");
  await modal.getByLabel("Author", { exact: true }).fill("Author");
  await modal.getByRole("button", { name: "Create writing project" }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator(".research-panel")).toHaveCount(0);
  page.once("dialog", d => d.accept("An accessible chapter"));
  await page.getByRole("button", { name: "Create a chapter", exact: true }).click();
  await page.locator("[contenteditable=true]").fill("Writing on a smaller screen.");
  await expect(page.getByText("● Saved on this computer")).toBeVisible();
  await page.reload();
  await expect(page.locator("[contenteditable=true]")).toContainText("Writing on a smaller screen.");
  await expect(page.locator(".research-panel")).toHaveCount(0);
});
