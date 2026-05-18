"use client";

import { useEffect, useRef, useState } from "react";

interface TypewriterLineProps {
  text: string;
  speedMs?: number;
}

/**
 * Animates text character-by-character.
 * Streaming-safe: if `text` grows (starts with what's already shown),
 * it continues from where it left off without restarting.
 * If `text` changes completely (new message), it restarts from scratch.
 */
export function TypewriterLine({ text, speedMs = 16 }: TypewriterLineProps) {
  const [displayed, setDisplayed] = useState("");
  const targetRef = useRef(text);
  const displayedRef = useRef("");

  useEffect(() => {
    targetRef.current = text;
    setDisplayed((current) => {
      if (text.startsWith(current)) return current;
      displayedRef.current = "";
      return "";
    });
  }, [text]);

  useEffect(() => {
    const id = setInterval(() => {
      const target = targetRef.current;
      const current = displayedRef.current;
      if (current.length >= target.length) return;

      const next = target.slice(0, current.length + 1);
      displayedRef.current = next;
      setDisplayed(next);
    }, speedMs);
    return () => clearInterval(id);
  }, [speedMs]);

  return <>{displayed || " "}</>;
}
