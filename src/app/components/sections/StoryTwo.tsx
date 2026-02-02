'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

import PolymorphicElement from '@/shared/components/ui/polymorphic-element';
import { cn } from '@/shared/utils/cn';

const StoryTwo = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, ...props }, ref) => {
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // Calculate progress based on how much of the section is visible
      // Progress starts when the top of the section enters the bottom of the viewport
      // and ends when the bottom of the section leaves the top of the viewport
      const totalHeight = rect.height + windowHeight;
      const currentPos = windowHeight - rect.top;

      const scrollProgress = Math.min(Math.max(currentPos / totalHeight, 0), 1);
      setProgress(scrollProgress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Animation values based on progress
  const scale = 0.8 + progress * 0.2; // 0.8 to 1.0
  const opacity = progress * 1.5; // Fades in quickly
  const translateY = (1 - progress) * 50; // Moves up as it scrolls

  return (
    <PolymorphicElement
      as="section"
      ref={ref}
      className={cn(
        'relative overflow-hidden bg-zinc-900 py-24 sm:py-32 dark:bg-zinc-950',
        className,
      )}
      {...props}
    >
      <div ref={containerRef} className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center text-center">
          <h2 className="text-base leading-7 font-semibold text-zinc-400">
            Interactive Experience
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Scale your vision with precision
          </p>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
            Experience the fluidity of a modern interface. Built with
            performance-first principles to ensure your users stay engaged.
          </p>
        </div>

        <div className="mt-16 flex justify-center">
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-zinc-800 shadow-2xl transition-all duration-75 ease-out"
            style={{
              transform: `scale(${scale}) translateY(${translateY}px)`,
              opacity: Math.min(opacity, 1),
            }}
          >
            <div
              className="aspect-[16/9] w-full bg-gradient-to-br from-zinc-700 to-zinc-900"
              aria-hidden="true"
            >
              <div className="flex h-full items-center justify-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/10">
                  <div className="h-12 w-12 animate-pulse rounded-full bg-white/20" />
                </div>
              </div>
            </div>

            {/* Decorative elements */}
            <div className="absolute bottom-4 left-4 h-2 w-24 rounded-full bg-white/10" />
            <div className="absolute right-4 bottom-4 h-2 w-12 rounded-full bg-white/10" />
            <div className="absolute top-4 left-4 flex gap-1.5">
              <div className="h-2 w-2 rounded-full bg-red-500/50" />
              <div className="h-2 w-2 rounded-full bg-yellow-500/50" />
              <div className="h-2 w-2 rounded-full bg-green-500/50" />
            </div>
          </div>
        </div>
      </div>
    </PolymorphicElement>
  );
});

StoryTwo.displayName = 'StoryTwo';

export { StoryTwo };
