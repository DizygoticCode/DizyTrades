"use client";

import { useEffect, useState } from "react";
import { CommandPalette } from "./command-palette";

export function CommandPaletteMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <CommandPalette /> : null;
}
