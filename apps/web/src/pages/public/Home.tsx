import { Hero } from "@/components/landing/Hero";
import { ProblemSolution } from "@/components/landing/ProblemSolution";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Solutions } from "@/components/landing/Solutions";
import { Audience } from "@/components/landing/Audience";
import { MarketplaceSection } from "@/components/landing/MarketplaceSection";
import { Stats } from "@/components/landing/Stats";
import { Testimonials } from "@/components/landing/Testimonials";
import { Partners } from "@/components/landing/Partners";
import { Faq } from "@/components/landing/Faq";
import { ContactSection, NewsletterSection } from "@/components/landing/Forms";
import { FinalCta } from "@/components/landing/FinalCta";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function Home() {
  usePageTitle();
  return (
    <>
      <Hero />
      <ProblemSolution />
      <HowItWorks />
      <Solutions />
      <Audience k="companies" tone="light" />
      <Audience k="students" tone="white" reverse />
      <Audience k="institutions" tone="light" />
      <MarketplaceSection />
      <Stats />
      <Testimonials />
      <Partners />
      <Faq limit={4} />
      <ContactSection />
      <NewsletterSection />
      <FinalCta />
    </>
  );
}
