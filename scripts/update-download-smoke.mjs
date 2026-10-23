// CI only: exercise GitHub's REAL Actions artifact redirect/download and SHA256.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const repository=process.env.GITHUB_REPOSITORY;
const token=process.env.GITHUB_TOKEN;
if(!repository||!token)throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required");
const api="https://api.github.com/repos/"+repository+"/";
const headers={
  Accept:"application/vnd.github+json",
  Authorization:"Bearer "+token,
  "X-GitHub-Api-Version":"2022-11-28",
  "User-Agent":"NOEMA-updater-HTTP-smoke"
};
async function json(endpoint){
  const res=await fetch(api+endpoint,{headers});
  assert.equal(res.status,200,"Unexpected GitHub API status "+res.status+" at "+endpoint);
  return await res.json();
}
const runs=await json("actions/workflows/windows.yml/runs?branch=main&status=success&per_page=8");
let chosen;
for(const run of runs.workflow_runs??[]){
  const artifacts=await json("actions/runs/"+run.id+"/artifacts?per_page=100");
  chosen=(artifacts.artifacts??[]).find(a=>
    !a.expired && a.name?.startsWith("NOEMA-") &&
    a.name?.endsWith("-Windows-installer") &&
    a.digest?.startsWith("sha256:") && a.workflow_run?.id===run.id
  );
  if(chosen)break;
}
assert.ok(chosen,"No previous successfully built NOEMA Windows artifact for updater testing");
const response=await fetch(api+"actions/artifacts/"+chosen.id+"/zip",{headers,redirect:"follow"});
assert.equal(response.status,200,"GitHub artifact download failed with HTTP "+response.status);
const bytes=Buffer.from(await response.arrayBuffer());
assert.ok(bytes.length>2000 && bytes.length<80*1024*1024,"Unexpected artifact size");
assert.equal(createHash("sha256").update(bytes).digest("hex"),
  chosen.digest.slice("sha256:".length).toLowerCase(),"Downloaded artifact SHA256 mismatch");
assert.equal(bytes.subarray(0,2).toString(),"PK","GitHub artifact was not ZIP");
console.log("GitHub artifact download succeeded with correct media type, redirect and SHA-256. Artifact ID: "+chosen.id);
