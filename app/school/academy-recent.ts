export const academyLastLessonKey = "dizyacademy-last-lesson-v1";

export function readAcademyLastLesson(
  storage: Pick<Storage, "getItem">,
  validSlugs: readonly string[],
) {
  const value = storage.getItem(academyLastLessonKey);
  return value && validSlugs.includes(value) ? value : null;
}

export function writeAcademyLastLesson(
  storage: Pick<Storage, "setItem">,
  slug: string,
  validSlugs: readonly string[],
) {
  if (validSlugs.includes(slug)) storage.setItem(academyLastLessonKey, slug);
}
