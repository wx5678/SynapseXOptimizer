import { useEffect, useState } from "react";

const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~|}{[]:;?><";

type ScrambleTextProps = {
  text: string;
  isHovered: boolean;
  className?: string;
};

export function ScrambleText({ text, isHovered, className }: ScrambleTextProps) {
  const [output, setOutput] = useState(text);

  useEffect(() => {
    if (!isHovered) {
      setOutput(text);
      return;
    }

    let frame = 0;
    const intervalId = window.setInterval(() => {
      frame += 1;
      const revealed = Math.floor(frame / 4);
      setOutput(
        text
          .split("")
          .map((character, index) => {
            if (character === " ") return " ";
            return index < revealed ? character : characters[Math.floor(Math.random() * characters.length)];
          })
          .join(""),
      );
      if (revealed >= text.length) {
        window.clearInterval(intervalId);
        setOutput(text);
      }
    }, 25);

    return () => window.clearInterval(intervalId);
  }, [isHovered, text]);

  return <span className={className}>{output}</span>;
}
