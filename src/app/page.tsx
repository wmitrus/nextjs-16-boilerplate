import type { Metadata } from 'next';

import { Footer } from '@/app/components/layout/Footer';
import { Header } from '@/app/components/layout/Header';
import { CTA } from '@/app/components/sections/CTA';
import { Features } from '@/app/components/sections/Features';
import { Hero } from '@/app/components/sections/Hero';
import { StoryOne } from '@/app/components/sections/StoryOne';
import { StoryTwo } from '@/app/components/sections/StoryTwo';
import { UseCases } from '@/app/components/sections/UseCases';

export const metadata: Metadata = {
  title: 'Next.js 16 Boilerplate | Build Your Next Idea Faster',
  description:
    'The ultimate production-ready Next.js 16 boilerplate with React 19, Tailwind CSS 4, and high-performance architecture.',
  openGraph: {
    title: 'Next.js 16 Boilerplate',
    description:
      'Build your next big idea faster than ever with our production-ready foundation.',
    type: 'website',
  },
};

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Header />
      <main className="flex-grow">
        <Hero />
        <StoryOne />
        <Features />
        <StoryTwo />
        <UseCases />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
