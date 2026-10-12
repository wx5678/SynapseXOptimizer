import { motion } from "framer-motion";

type SquashHamburgerProps = {
  open: boolean;
};

const transition = { type: "spring" as const, stiffness: 300, damping: 20 };

export function SquashHamburger({ open }: SquashHamburgerProps) {
  const common = "absolute left-0 block w-full origin-center bg-white sm:h-[1.5px] h-[1.2px]";

  return (
    <span className="relative block h-[10px] w-[15px] sm:h-[12px] sm:w-[18px]" aria-hidden="true">
      <motion.span
        className={common}
        initial={false}
        animate={open ? { top: "50%", y: "-50%", rotate: 45 } : { top: 0, y: 0, rotate: 0 }}
        transition={transition}
      />
      <motion.span
        className={`${common} top-1/2 -translate-y-1/2`}
        initial={false}
        animate={open ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }}
        transition={transition}
      />
      <motion.span
        className={common}
        initial={false}
        animate={open ? { bottom: "50%", y: "50%", rotate: -45 } : { bottom: 0, y: 0, rotate: 0 }}
        transition={transition}
      />
    </span>
  );
}
