import {useMemo,useState} from "react";
import type {Project,Chapter} from "./types";

type Props={
  projects:Project[];
  chaptersByBook:Record<string,number>;
  onOpen:(book:Project)=>void;
  onCreate:()=>void;
  onUpdates:()=>void;
  onTheme:()=>void;
  theme:string;
  busy:boolean;
  availableUpdate:string|null;
  archivedScripts:number;
};

export default function LibraryHome({
  projects,chaptersByBook,onOpen,onCreate,onUpdates,onTheme,theme,busy,availableUpdate,archivedScripts
}:Props){
  const [search,setSearch]=useState("");
  const [sort,setSort]=useState<"recent"|"title">("recent");
  const recentId=localStorage.getItem("noema-last-project");
  const books=useMemo(()=>{
    const query=search.trim().toLocaleLowerCase();
    return projects.filter(p=>p.project_type==="Book").filter(p=>
      !query||[p.title,p.author,p.description].some(s=>s.toLocaleLowerCase().includes(query))
    ).sort((a,b)=>sort==="title"?a.title.localeCompare(b.title):
      a.id===recentId?-1:b.id===recentId?1:a.title.localeCompare(b.title));
  },[projects,search,sort,recentId]);
  const totalBooks=projects.filter(p=>p.project_type==="Book").length;
  return <div className="book-library" aria-label="NOEMA book library">
    <header className="book-library-topbar">
      <div className="book-library-brand"><div className="book-library-mark">N</div>
        <div><strong>NOEMA</strong><span>WHERE THOUGHT BECOMES LEGACY</span></div></div>
      <div className="book-library-top-actions">
        <span className="book-library-local"><span className="local-dot"/> Local writing studio</span>
        <button onClick={onTheme} aria-label="Toggle theme" title="Toggle theme">{theme==="dark"?"☀":"◐"}</button>
        <button onClick={onUpdates} aria-label="Open NOEMA updates">
          Updates {availableUpdate&&<span className="library-update-pill">{availableUpdate}</span>}
        </button>
      </div>
    </header>
    <main className="book-library-content">
      <div className="book-library-hero">
        <div className="eyebrow">WELCOME TO YOUR WRITING ROOM</div>
        <h1>Your books begin here<span>.</span></h1>
        <p>Each book is a world of thought. Choose one to return to your writing, research, and dialogues—or begin something new.</p>
        <div className="book-library-hero-actions">
          <button className="primary" disabled={busy} onClick={onCreate}>+ Create a book</button>
          <span>{totalBooks} {totalBooks===1?"book":"books"} in your library</span>
        </div>
      </div>
      <section className="book-library-section" aria-label="Your books">
        <div className="book-library-section-head">
          <div><div className="eyebrow">YOUR SHELF</div><h2>Books in progress</h2></div>
          <div className="book-library-controls">
            <label className="book-library-search">
              <span className="sr-only">Search your books</span>
              <input aria-label="Search your books" type="search" placeholder="Find a book…" value={search} onChange={e=>setSearch(e.target.value)}/>
            </label>
            <label>
              <span className="sr-only">Sort books</span>
              <select aria-label="Sort books" value={sort} onChange={e=>setSort(e.target.value as "recent"|"title")}>
                <option value="recent">Recently opened</option><option value="title">Title A–Z</option>
              </select>
            </label>
          </div>
        </div>
        <div className="book-library-grid">
          {books.map((book,index)=><button className="book-library-card" key={book.id}
            disabled={busy} onClick={()=>onOpen(book)} aria-label={"Open book: "+book.title}>
            <div className={"book-library-cover book-cover-"+(index%5)}>
              <div className="book-cover-line"/><div className="book-cover-emblem">❦</div>
              <span className="book-cover-title">{book.title}</span>
              <span className="book-cover-author">{book.author}</span>
              <div className="book-cover-footer">NOEMA · BOOK</div>
            </div>
            <div className="book-library-card-details">
              <div className="book-library-book-tag">{book.id===recentId?"LAST OPENED":"IN PROGRESS"}</div>
              <h3>{book.title}</h3>
              <p>{book.description||"A story and a purpose still taking shape."}</p>
              <div className="book-library-card-foot"><span>{chaptersByBook[book.id]===undefined?"Your manuscript":chaptersByBook[book.id]+" "+(chaptersByBook[book.id]===1?"chapter":"chapters")}</span>
              <span>Open book →</span></div>
            </div>
          </button>)}
          {!search&&<button className="book-library-new" onClick={onCreate} disabled={busy}>
            <span className="book-library-new-icon">+</span><strong>Begin a new book</strong>
            <span>Give your next idea a place to grow.</span>
          </button>}
        </div>
        {books.length===0&&<div className="book-library-empty">
          <span>✦</span><h3>{search?"No books match that search.":"Your bookshelf is ready."}</h3>
          <p>{search?"Try a different title or author.":"Start your first book and NOEMA will keep its writing, research and dialogues together."}</p>
          {!search&&<button className="primary" onClick={onCreate}>Create your first book</button>}
        </div>}
      </section>
      <footer className="book-library-footer">
        <div>❦ <span>Your writing stays on this computer.</span></div>
        <span>NOEMA · BOOK WRITING STUDIO</span>
      </footer>
      {archivedScripts>0&&<p className="book-library-legacy-note">{archivedScripts} older video-script {archivedScripts===1?"project remains":"projects remain"} preserved in local storage for future SCRIPTORIA migration. No script files were deleted.</p>}
    </main>
  </div>;
}
