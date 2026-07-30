"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SCHOOL_DISPLAY_NAME } from "@/app/lib/branding";
import ConceptDiagram from "./concept-diagram";
import { filterLessons, glossary, lessonGroups, lessons, readProgress, writeProgress } from "./lessons";

export default function SchoolClient() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(lessons[0].slug);
  const [completed, setCompleted] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [glossaryQuery, setGlossaryQuery] = useState("");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { setCompleted(readProgress(window.localStorage)); setReady(true); });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { if (ready) writeProgress(window.localStorage, completed); }, [completed, ready]);
  const visible = useMemo(() => filterLessons(query), [query]);
  const lesson = lessons.find((item) => item.slug === selected) ?? lessons[0];
  const index = lessons.indexOf(lesson);
  const glossaryItems = glossary.filter(([term, definition]) => `${term} ${definition}`.toLowerCase().includes(glossaryQuery.toLowerCase()));
  const choose = (slug: string) => { setSelected(slug); setMenuOpen(false); document.querySelector("#lesson")?.scrollIntoView({ behavior: "smooth" }); };
  return <main className="school-shell">
    <header className="school-header">
      <Link className="school-brand" href="/login"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span><span><b>{SCHOOL_DISPLAY_NAME}</b><small>Quality education. Questionable spelling.</small></span></Link>
      <nav aria-label="DizyTrades links"><Link href="/login">Public site</Link><Link href="/login#view-only">View-only chart</Link><Link className="primary-link" href="/">Open terminal</Link></nav>
    </header>
    <div className="school-notice" role="note"><b>Learn safely.</b> Educational content only—not financial advice. Markets can cause total loss. Live trading remains disabled.</div>
    <div className="school-mobile-bar"><button aria-expanded={menuOpen} aria-controls="course-navigation" onClick={() => setMenuOpen(!menuOpen)}>☰ Course contents</button><span>{completed.length}/{lessons.length} complete</span></div>
    <div className="school-layout">
      <aside className={menuOpen ? "school-sidebar open" : "school-sidebar"} id="course-navigation" aria-label="Course navigation">
        <label className="school-search"><span className="sr-only">Search lessons</span><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lessons…" type="search" /></label>
        <div className="progress-copy"><span>Course progress</span><b>{Math.round(completed.length / lessons.length * 100)}%</b></div><progress max={lessons.length} value={completed.length}>{completed.length} of {lessons.length}</progress>
        {lessonGroups.map((group) => <section className="course-group" key={group}><h2>{group}</h2><ol>{visible.filter((item) => item.group === group).map((item) => <li key={item.slug}><button className={item.slug === lesson.slug ? "active" : ""} aria-current={item.slug === lesson.slug ? "page" : undefined} onClick={() => choose(item.slug)}><span className={completed.includes(item.slug) ? "lesson-check done" : "lesson-check"} aria-hidden="true">{completed.includes(item.slug) ? "✓" : lessons.indexOf(item) + 1}</span><span>{item.title}</span></button></li>)}</ol></section>)}
        {visible.length === 0 ? <p className="no-results">No lessons match “{query}”.</p> : null}
      </aside>
      <article className="lesson" id="lesson" tabIndex={-1} aria-label={`${SCHOOL_DISPLAY_NAME} lesson: ${lesson.title}`}>
        <div className="lesson-kicker"><span>{SCHOOL_DISPLAY_NAME} · {lesson.group}</span><span>Lesson {index + 1} of {lessons.length}</span></div><h1>{lesson.title}</h1><p className="lesson-lead">{lesson.summary}</p>
        {lesson.diagram ? <ConceptDiagram type={lesson.diagram}/> : null}
        {lesson.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}</section>)}
        {lesson.chartQuery ? <Link className="try-link" href={`/?school=${lesson.chartQuery}`} target="_blank" rel="noopener noreferrer"><span>↗</span><span><b>Try this in DizyCharts</b><small>Opens the terminal in a new tab</small></span></Link> : null}
        <label className="complete-control"><input checked={completed.includes(lesson.slug)} onChange={() => setCompleted((current) => current.includes(lesson.slug) ? current.filter((slug) => slug !== lesson.slug) : [...current, lesson.slug])} type="checkbox"/><span><b>Mark lesson complete</b><small>Progress is stored only in this browser.</small></span></label>
        <nav className="lesson-pager" aria-label="Lesson pagination">{index > 0 ? <button onClick={() => choose(lessons[index - 1].slug)}>← <span>Previous<br/><b>{lessons[index - 1].title}</b></span></button> : <span/>}{index < lessons.length - 1 ? <button onClick={() => choose(lessons[index + 1].slug)}><span>Next<br/><b>{lessons[index + 1].title}</b></span> →</button> : null}</nav>
        <section className="glossary" id="glossary"><div><span className="eyebrow">Reference</span><h2>Searchable glossary</h2></div><label><span className="sr-only">Search glossary</span><input type="search" placeholder="Search terms…" value={glossaryQuery} onChange={(event) => setGlossaryQuery(event.target.value)}/></label><dl>{glossaryItems.map(([term, definition]) => <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}</dl></section>
      </article>
    </div>
    <footer className="school-footer"><b>{SCHOOL_DISPLAY_NAME}</b><span>Education, confirmed-candle discipline and simulation—not financial advice.</span><Link href="/login">Back to DizyTrades</Link></footer>
  </main>;
}
