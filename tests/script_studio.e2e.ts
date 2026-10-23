import {test,expect} from "@playwright/test";

test("NOEMA opens to its book library, hides YouTube controls, and preserves legacy scripts",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Your books begin here."})).toBeVisible();
  await expect(page.getByText("YouTube channels")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"+ Create a book"})).toBeVisible();
  // The storage core retains old Video Script projects for a later SCRIPTORIA migration.
  // They must never appear as book cards or be deleted by the books-only UI.
  const archived=await page.evaluate(async()=>{
    const response=await fetch("http://127.0.0.1:4318/request",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"create_project",args:{
        title:"Preserved video script",author:"Test author",project_type:"Video Script",
        channel_id:"",description:"Keep this for SCRIPTORIA"
      }})
    });
    if(!response.ok)throw new Error("Could not set up legacy-project test");
    return response.json();
  });
  await page.reload();
  await expect(page.getByRole("heading",{name:"Your books begin here."})).toBeVisible();
  await expect(page.getByRole("button",{name:"Open book: Preserved video script"})).toHaveCount(0);
  await expect(page.getByText("1 older video-script project remains preserved")).toBeVisible();
  const persisted=await page.evaluate(async()=>{
    const response=await fetch("http://127.0.0.1:4318/request",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"projects",args:{}})
    });
    if(!response.ok)throw new Error("Could not read stored projects");
    return response.json();
  });
  expect(persisted.some((p:{id:string;title:string})=>p.id===archived.id&&p.title==="Preserved video script")).toBe(true);
  await page.getByRole("button",{name:"+ Create a book"}).click();
  const modal=page.getByRole("dialog",{name:"New writing project"});
  await expect(modal.getByText("Create a book project")).toBeVisible();
  await expect(modal.getByText("YouTube channel script")).toHaveCount(0);
  await modal.getByLabel("Book title").fill("The first book");
  await modal.getByLabel("Author").fill("Test author");
  await modal.getByRole("button",{name:"Create book →"}).click();
  await expect(modal).toBeHidden();
  await expect(page.getByRole("button",{name:"YouTube channels"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"← All books"})).toBeVisible();
  await page.getByRole("button",{name:"← All books"}).click();
  await expect(page.getByRole("heading",{name:"Your books begin here."})).toBeVisible();
  await expect(page.getByRole("button",{name:"Open book: The first book"})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading",{name:"Your books begin here."})).toBeVisible();
  await page.getByRole("button",{name:"Open book: The first book"}).click();
  await expect(page.getByLabel("Current project")).toHaveValue(/.+/);
  expect(errors).toEqual([]);
});
