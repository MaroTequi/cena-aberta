"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
export function CardTitle({ children }: { children: string }) {
  const frame = useRef<HTMLElement>(null),
    text = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  useEffect(() => {
    const measure = () => {
      if (frame.current && text.current) setDistance(Math.max(0, text.current.scrollWidth - frame.current.clientWidth));
    };
    const observer = new ResizeObserver(measure);
    if (frame.current) observer.observe(frame.current);
    if (text.current) observer.observe(text.current);
    measure();
    return () => observer.disconnect();
  }, [children]);
  return (
    <strong
      ref={frame}
      className="card-title"
      title={children}
      data-overflow={distance > 1}
      style={
        {
          "--title-distance": `-${distance}px`,
          "--title-duration": `${Math.max(4, distance / 25 + 2)}s`,
        } as CSSProperties
      }
    >
      <span ref={text}>{children}</span>
    </strong>
  );
}
