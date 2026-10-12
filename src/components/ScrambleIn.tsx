import { useEffect, useState } from "react";

const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~|}{[]:;?><";

type ScrambleInProps = {
  text: string;
  delay: number;
  triggered: boolean;
};

export function ScrambleIn({ text, delay, triggered }: ScrambleInProps) {
  const [output, setOutput] = useState("\u00a0");

  useEffect(() => {
    if (!triggered) {
      setOutput("\u00a0");
      return;
    }

    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      let cursor = 0;
      intervalId = window.setInterval(() => {
        cursor += 0.5;
        const reveal = Math.floor(cursor);
        const next = text
          .split("")
          .map((character, index) => {
            if (character === " ") return " ";
            if (index < reveal) return character;
            if (index <= reveal + 3) return characters[Math.floor(Math.random() * characters.length)];
            return "";
          })
          .join("");
        setOutput(next);
        if (reveal >= text.length) {
          if (intervalId !== undefined) window.clearInterval(intervalId);
          setOutput(text);
        }
      }, 25);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [delay, text, triggered]);

  return <>{output}</>;
}
