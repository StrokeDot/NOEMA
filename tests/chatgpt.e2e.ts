import {test,expect} from "@playwright/test";

test("subscription connection uses account models, preserves API options and clears stale account choices",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{
    type Account={id:string;label:string;connected:boolean};
    const accounts:Account[]=[];
    let active:string|null=null;
    const commands:{command:string;args:Record<string,unknown>}[]=[];
    const status=()=>({accounts:accounts.map(a=>({...a})),active,connected:accounts.some(a=>a.id===active&&a.connected)});
    const host=window as unknown as {isTauri:boolean;__TAURI_INTERNALS__:unknown;__TAURI_EVENT_PLUGIN_INTERNALS__:unknown;noemaCommands:typeof commands};
    host.isTauri=true;
    host.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
    host.noemaCommands=commands;
    host.__TAURI_INTERNALS__={
      metadata:{currentWindow:{label:"main"},currentWebview:{label:"main"}},
      transformCallback:()=>1,unregisterCallback:()=>{},
      invoke:async(command:string,args:Record<string,unknown>={})=>{
        commands.push({command,args});
        if(command==="request"){
          const r=await fetch("http://127.0.0.1:4318/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(args)});
          const body=await r.json();if(!r.ok)throw new Error(body.error);return body;
        }
        if(command==="ai_status")return {openai_key_saved:false,anthropic_key_saved:false};
        if(command==="update_check")return {available:false};
        if(command==="chatgpt_status")return status();
        if(command==="chatgpt_login"){
          const id=typeof args.accountId==="string"?args.accountId:accounts.length?"oaiapp_b":"oaiapp_a";
          const saved=accounts.find(a=>a.id===id);
          if(saved)saved.connected=true;
          else accounts.push({id,label:id==="oaiapp_a"?"Writer A · workspace A":"Writer B · workspace B",connected:true});
          active=id;return status();
        }
        if(command==="chatgpt_models")return {models:[{id:active==="oaiapp_a"?"account-a-model":"account-b-model",label:active==="oaiapp_a"?"Model for A":"Model for B"}]};
        if(command==="chatgpt_select"){active=String(args.accountId);return status()}
        if(command==="chatgpt_logout"){
          const a=accounts.find(a=>a.id===args.accountId);if(a)a.connected=false;
          if(active===args.accountId)active=null;
          return {...status(),revoked:false};
        }
        if(command==="ai_local_models")throw new Error("Offline test model service");
        if(command==="plugin:event|listen")return 1;
        if(command==="plugin:event|unlisten"||command==="chatgpt_cancel_login")return;
        throw new Error("Unexpected native command: "+command);
      }
    };
  });
  await page.goto("/");
  await page.getByRole("button",{name:"+ Create a book"}).click();
  const project=page.getByRole("dialog",{name:"New writing project"});
  await project.getByLabel("Book title",{exact:true}).fill("Subscription writing test");
  await project.getByLabel("Author",{exact:true}).fill("Author");
  await project.getByRole("button",{name:"Create book →"}).click();
  await page.getByRole("button",{name:"Book dialogue",exact:true}).click();
  await page.getByRole("button",{name:"+ New dialogue"}).click();
  await page.getByRole("button",{name:"Cloud AI"}).click();
  await page.getByRole("button",{name:"ChatGPT subscription"}).click();
  await expect(page.getByLabel("Provider connection key")).toHaveCount(0);
  await page.getByRole("button",{name:"Continue with ChatGPT",exact:true}).click();
  await expect(page.getByLabel("ChatGPT subscription model")).toHaveValue("account-a-model");
  await expect(page.getByText("Writer A · workspace A · active",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Continue to your dialogue"}).click();
  await page.getByLabel("Conversation subject").fill("Book context");
  await page.getByLabel("Purpose for the book").fill("Develop ideas using the selected writing account.");
  await page.getByRole("button",{name:"Create dialogue"}).click();
  await page.getByRole("button",{name:"Choose AI model"}).click();
  await expect(page.getByLabel("Selected AI model")).toHaveValue("account-a-model");
  await page.getByRole("button",{name:"Add another ChatGPT account",exact:true}).click();
  await expect(page.getByLabel("Selected AI model")).toHaveValue("account-b-model");
  await expect(page.getByRole("option",{name:"Model for A",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Use account",exact:true}).click();
  await expect(page.getByLabel("Selected AI model")).toHaveValue("account-a-model");
  const accountA=page.locator(".chatgpt-account").filter({hasText:"Writer A"});
  await accountA.getByRole("button",{name:"Sign out",exact:true}).click();
  await expect(page.getByText(/Remote revocation was not confirmed/)).toBeVisible();
  await expect(page.getByLabel("Selected AI model")).toHaveValue("");
  await page.getByLabel("Message the writing assistant").fill("A thought for the book");
  await expect(page.getByRole("button",{name:"Send message",exact:true})).toBeDisabled();
  await accountA.getByRole("button",{name:"Continue with saved account"}).click();
  await expect(page.getByLabel("Selected AI model")).toHaveValue("account-a-model");
  const commands=await page.evaluate(()=>(window as unknown as {noemaCommands:{command:string;args:Record<string,unknown>}[]}).noemaCommands);
  expect(commands.some(c=>c.command==="ai_configure_provider")).toBe(false);
  expect(commands.some(c=>c.command==="ai_reply")).toBe(false);
  expect(commands.filter(c=>c.command==="chatgpt_login").at(-1)?.args.accountId).toBe("oaiapp_a");
  expect(errors).toEqual([]);
});
