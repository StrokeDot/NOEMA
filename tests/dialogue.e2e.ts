import {test,expect} from "@playwright/test";

test("book dialogue keeps separate conversation purposes and preserves them after reopening",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Your books begin here."})).toBeVisible();
  await page.getByRole("button",{name:"+ Create a book"}).click();
  const project=page.getByRole("dialog",{name:"New writing project"});
  await expect(project).toBeVisible();
  await project.getByLabel("Book title",{exact:true}).fill("Dialogue-first book");
  await project.getByLabel("Author",{exact:true}).fill("Author");
  await project.getByRole("button",{name:"Create book →"}).click();
  await expect(project).toBeHidden();
  await page.getByRole("button",{name:"Book dialogue",exact:true}).click();
  await expect(page.getByText("What shall we think through?")).toBeVisible();
  await page.getByRole("button",{name:"+ New dialogue"}).click();
  await expect(page.getByRole("heading",{name:"How would you like to write together?"})).toBeVisible();
  await page.getByRole("button",{name:"Local AI"}).click();
  await page.getByLabel("Conversation subject").fill("Moral freedom");
  await page.getByLabel("Purpose for the book").fill("Develop a careful definition without assuming the conclusion.");
  await page.getByRole("button",{name:"Create dialogue"}).click();
  await expect(page.locator(".dialogue-topline").getByRole("heading",{name:"Moral freedom"})).toBeVisible();
  await expect(page.locator(".dialogue-topline").getByText("Develop a careful definition without assuming the conclusion.")).toBeVisible();
  await page.getByRole("button",{name:"+ New dialogue"}).click();
  await page.getByRole("button",{name:"Cloud AI"}).click();
  await expect(page.getByRole("heading",{name:"Who would you like to write with?"})).toBeVisible();
  await page.getByRole("button",{name:"ChatGPT · OpenAI"}).click();
  await expect(page.getByRole("heading",{name:"Connect ChatGPT models"})).toBeVisible();
  await expect(page.getByLabel("Provider connection key")).toBeVisible();
  await expect(page.getByRole("button",{name:"Save connection & continue"})).toBeDisabled();
  await page.getByRole("button",{name:"← Back"}).click();
  await page.getByRole("button",{name:"Claude · Anthropic"}).click();
  await expect(page.getByRole("heading",{name:"Connect Claude models"})).toBeVisible();
  await expect(page.getByText("not the same as API access")).toBeVisible();
  await page.getByRole("button",{name:"← Back"}).click();
  await page.getByRole("button",{name:"← Back"}).click();
  await page.getByRole("button",{name:"Local AI"}).click();
  await page.getByLabel("Conversation subject").fill("Objections");
  await page.getByLabel("Purpose for the book").fill("Steelman the best counterarguments.");
  await page.getByRole("button",{name:"Create dialogue"}).click();
  await expect(page.locator(".dialogue-topline").getByRole("heading",{name:"Objections"})).toBeVisible();
  await page.locator(".dialogue-thread").filter({hasText:"Moral freedom"}).click();
  await expect(page.locator(".dialogue-topline").getByText("Develop a careful definition without assuming the conclusion.")).toBeVisible();
  await page.getByRole("button",{name:"Edit purpose"}).click();
  await page.getByLabel("Purpose for the book").fill("Clarify and challenge the concept of free will.");
  await page.getByRole("button",{name:"Save purpose"}).click();
  await expect(page.locator(".dialogue-topline").getByText("Clarify and challenge the concept of free will.")).toBeVisible();
  await page.getByRole("button",{name:"Choose AI model"}).click();
  await expect(page.getByText("Available on this computer")).toBeVisible();
  await expect(page.getByText("Discover and download")).toBeVisible();
  // Offline Ollama must never present Download as an available action.
  await expect(page.getByRole("button",{name:"Reconnect first"}).first()).toBeVisible();
  await expect(page.getByRole("button",{name:"Reconnect first"}).first()).toBeDisabled();
  // Deleting a conversation must not delete a book. Trash permits recovery.
  await page.once("dialog",dialog=>void dialog.accept());
  await page.getByRole("button",{name:"Delete dialogue"}).click();
  await expect(page.locator(".dialogue-thread")).toHaveCount(1);
  await expect(page.getByText("Recently deleted (1)")).toBeVisible();
  await page.locator(".dialogue-trashed > summary").click();
  await page.locator(".dialogue-trashed").getByRole("button",{name:"Restore"}).click();
  await expect(page.locator(".dialogue-thread")).toHaveCount(2);
  await expect(page.locator(".dialogue-topline").getByRole("heading",{name:"Moral freedom"})).toBeVisible();
  await page.getByRole("button",{name:"Choose AI model"}).click();
  await expect(page.getByRole("button",{name:"Start Ollama & reconnect"})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading",{name:"Your books begin here."})).toBeVisible();
  await page.getByRole("button",{name:"Open book: Dialogue-first book"}).click();
  await page.getByRole("button",{name:"Book dialogue",exact:true}).click();
  await expect(page.locator(".dialogue-topline").getByRole("heading",{name:"Moral freedom"})).toBeVisible();
  await expect(page.locator(".dialogue-topline").getByText("Clarify and challenge the concept of free will.")).toBeVisible();
  await expect(page.locator(".dialogue-thread")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("saved explanatory visuals render alongside the reply", async ({ page, request }) => {
  async function store(action: string, args: Record<string, unknown>) {
    const response = await request.post("http://127.0.0.1:4318/request", { data: { action, args } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your books begin here." })).toBeVisible();
  await page.getByRole("button", { name: "+ Create a book" }).click();
  const form = page.getByRole("dialog", { name: "New writing project" });
  await form.getByLabel("Book title", { exact: true }).fill("Illustrated book");
  await form.getByLabel("Author", { exact: true }).fill("Author");
  const created = page.waitForResponse(response =>
    response.url() === "http://127.0.0.1:4318/request" &&
    response.request().method() === "POST" &&
    response.request().postDataJSON()?.action === "create_project",
  );
  await form.getByRole("button", { name: "Create book →" }).click();
  const createdResponse = await created;
  expect(createdResponse.ok(), await createdResponse.text()).toBe(true);
  const project = await createdResponse.json();
  await expect(form).toBeHidden();

  const dialogue = await store("create_book_dialogue", {
    project_id: project.id, title: "From evidence to claim", goal: "Refine the argument."
  });
  const context = { project_id: project.id, dialogue_id: dialogue.id };

  const examples = [
    { kind: "flow", title: "Evidence to conclusion" },
    { kind: "timeline", title: "How the argument developed" },
    { kind: "comparison", title: "Two readings of the evidence" }
  ];
  for (const example of examples) {
    const turn = await store("begin_writing_turn", { ...context, original_text: example.title });
    await store("complete_writing_turn", {
      ...context, turn_id: turn.id, provider: "chatgpt", model: "test",
      interpreted_text: "Explain the idea.", assistant_response: "Here is the written explanation.",
      critical_review: "Check whether a different reading fits the evidence.",
      visual: { ...example, items: [{ label: "Observation", detail: "<b>Look again</b>" }, { label: "Inference", detail: "" }] }
    });
  }

  const dialogueButton = page.getByRole("button", { name: "Book dialogue", exact: true });
  await dialogueButton.click();
  for (const example of examples) {
    const figure = page.getByRole("figure", { name: example.title });
    await expect(figure).toBeVisible();
    await expect(figure.locator("li")).toHaveText(["Observation<b>Look again</b>", "Inference"]);
    await expect(figure.locator("b")).toHaveCount(0);
    await expect(figure.locator("..").getByText("Here is the written explanation.")).toBeVisible();
  }

  await page.reload();
  await expect(page.getByRole("heading", { name: "Your books begin here." })).toBeVisible();
  await page.getByRole("button", { name: "Open book: Illustrated book", exact: true }).click();
  await dialogueButton.click();
  await expect(page.getByRole("figure", { name: "Evidence to conclusion" })).toBeVisible();
});
