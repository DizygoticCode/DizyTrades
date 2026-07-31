"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SCHOOL_DISPLAY_NAME } from "@/app/lib/branding";
import ConceptDiagram from "./concept-diagram";
import { academyGlossary, academyLessonGroups, academyLessons, filterAcademyLessons, readAcademyProgress, writeAcademyProgress } from "./academy-extension";

export default function SchoolClient() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(academyLessons[0].slug);
  const [completed, setCompleted] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [glossaryQuery, setGlossaryQuery] = useState("");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { setCompleted(readAcademyProgress(window.localStorage)); setReady(true); });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { if (ready) writeAcademyProgress(window.localStorage, completed); }, [completed, ready]);
  const visible = useMemo(() => filterAcademyLessons(query), [query]);
  const lesson = academyLessons.find((item) => item.slug === selected) ?? academyLessons[0];
  const index = academyLessons.indexOf(lesson);
  const glossaryItems = academyGlossary.filter(([term, definition]) => `${term} ${definition}`.toLowerCase().includes(glossaryQuery.toLowerCase()));
  const choose = (slug: string) => { setSelected(slug); setMenuOpen(false); document.querySelector("#lesson")?.scrollIntoView({ behavior: "smooth" }); };
  return <main className="school-shell">
    <header className="school-header">
      <Link className="school-brand" href="/"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span><span><b>{SCHOOL_DISPLAY_NAME}</b><small>Quality education. Questionable spelling.</small></span></Link>
      <nav aria-label="DizyTrades links"><Link href="/">Public site</Link><Link href="/explore">View-only chart</Link><Link className="primary-link" href="/login">Open terminal</Link></nav>
    </header>
    <div className="school-notice" role="note"><b>Learn safely.</b> Educational content only—not financial advice. Markets can cause total loss. Live trading remains disabled.</div>
    <div className="school-mobile-bar"><button aria-expanded={menuOpen} aria-controls="course-navigation" onClick={() => setMenuOpen(!menuOpen)}>☰ Course contents</button><span>{completed.length}/{academyLessons.length} complete</span></div>
    <div className="school-layout">
      <aside className={menuOpen ? "school-sidebar open" : "school-sidebar"} id="course-navigation" aria-label="Course navigation">
        <label className="school-search"><span className="sr-only">Search lessons</span><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lessons…" type="search" /></label>
        <div className="progress-copy"><span>Course progress</span><b>{Math.round(completed.length / academyLessons.length * 100)}%</b></div><progress max={academyLessons.length} value={completed.length}>{completed.length} of {academyLessons.length}</progress>
        {academyLessonGroups.map((group) => <section className="course-group" key={group}><h2>{group}</h2><ol>{visible.filter((item) => item.group === group).map((item) => <li key={item.slug}><button className={item.slug === lesson.slug ? "active" : ""} aria-current={item.slug === lesson.slug ? "page" : undefined} onClick={() => choose(item.slug)}><span className={completed.includes(item.slug) ? "lesson-check done" : "lesson-check"} aria-hidden="true">{completed.includes(item.slug) ? "✓" : academyLessons.indexOf(item) + 1}</span><span>{item.title}</span></button></li>)}</ol></section>)}
        {visible.length === 0 ? <p className="no-results">No lessons match “{query}”.</p> : null}
      </aside>
      <article className="lesson" id="lesson" tabIndex={-1} aria-label={`${SCHOOL_DISPLAY_NAME} lesson: ${lesson.title}`}>
        <div className="lesson-kicker"><span>{SCHOOL_DISPLAY_NAME} · {lesson.group}</span><span>Lesson {index + 1} of {academyLessons.length}</span></div><h1>{lesson.title}</h1><p className="lesson-lead">{lesson.summary}</p>
        <ConceptDiagram type={lesson.diagram} lessonSlug={lesson.slug}/>
        {lesson.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}</section>)}
        {lesson.chartQuery ? <Link className="try-link" href="/login" target="_blank" rel="noopener noreferrer"><span>↗</span><span><b>Try this in DizyCharts</b><small>Sign in or continue in view-only mode</small></span></Link> : null}
        <label className="complete-control"><input checked={completed.includes(lesson.slug)} onChange={() => setCompleted((current) => current.includes(lesson.slug) ? current.filter((slug) => slug !== lesson.slug) : [...current, lesson.slug])} type="checkbox"/><span><b>Mark lesson complete</b><small>Progress is stored only in this browser.</small></span></label>
        <nav className="lesson-pager" aria-label="Lesson pagination">{index > 0 ? <button onClick={() => choose(academyLessons[index - 1].slug)}>← <span>Previous<br/><b>{academyLessons[index - 1].title}</b></span></button> : <span/>}{index < academyLessons.length - 1 ? <button onClick={() => choose(academyLessons[index + 1].slug)}><span>Next<br/><b>{academyLessons[index + 1].title}</b></span> →</button> : null}</nav>
        <section className="glossary" id="glossary"><div><span className="eyebrow">Reference</span><h2>Searchable glossary</h2></div><label><span className="sr-only">Search glossary</span><input type="search" placeholder="Search terms…" value={glossaryQuery} onChange={(event) => setGlossaryQuery(event.target.value)}/></label><dl>{glossaryItems.map(([term, definition]) => <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}</dl></section>
      </article>
    </div>
    <footer className="school-footer"><b>{SCHOOL_DISPLAY_NAME}</b><span>Education, confirmed-candle discipline and simulation—not financial advice.</span><Link href="/">Back to DizyTrades</Link></footer>
  </main>;
}
