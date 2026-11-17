import { useEffect, useRef } from 'react';
import type { ReactNode, Ref } from 'react';
import { motion, useIsPresent, useMotionValue, useSpring, useTransform } from 'motion/react';
import type { Transition } from 'motion/react';

// One spring for the whole Personal workspace: quick to settle, with a slight natural overshoot.
export const spring: Transition = { type: 'spring', stiffness: 520, damping: 38, mass: 0.9 };

// A list row that fades in, and fades out while the rest of the list slides into place.
// A leaving row is hidden from assistive technology and cannot be clicked again.
export function ListItem({ children, className, ref }: { children: ReactNode; className?: string; ref?: Ref<HTMLLIElement> }) {
  const present = useIsPresent();
  return <motion.li ref={ref} layout="position" className={className} aria-hidden={present ? undefined : true} inert={!present}
    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
    transition={spring}>{children}</motion.li>;
}

// Counts smoothly from the previous value to the new one in whole steps (points are stored
// in hundredths, so a step of 100 counts whole points) and lands exactly on the new value.
export function AnimatedNumber({ value, format, step = 1 }: { value: number; format(value: number): string; step?: number }) {
  const target = useMotionValue(value);
  const latest = useRef(value);
  latest.current = value;
  const smooth = useSpring(target, { stiffness: 140, damping: 22 });
  const text = useTransform(smooth, current =>
    format(Math.abs(current - latest.current) < step / 2 ? latest.current : Math.round(current / step) * step));
  useEffect(() => { target.set(value); }, [target, value]);
  return <motion.span>{text}</motion.span>;
}
