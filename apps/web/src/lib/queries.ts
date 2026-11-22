import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export interface PublicChallenge {
  id: string; slug: string; title: string; summary: string; company: string; sector: { name: string; slug: string } | null;
  skills: { name: string; slug: string; minLevel: string }[]; durationWeeks: number | null; teamSize: number;
  publishedAt: string | null; isDemo: boolean;
}
export interface PublicChallengeDetail extends PublicChallenge { context: string; objectives: string | null; keywords: string[] }
export interface Skill { id: string; name: string; slug: string; category: "TECHNIQUE" | "METIER" | "TRANSVERSALE" | "SECTORIELLE" }
export interface Sector { id: string; name: string; slug: string }

export const usePublicStats = () => useQuery({ queryKey: ["stats"], queryFn: () => api<{ students: number; mentors: number; companies: number; institutions: number; challenges: number; isDemoData: boolean }>("/public/stats", { auth: false }), staleTime: 60_000 });
export const useTestimonials = () => useQuery({ queryKey: ["testimonials"], queryFn: () => api<{ testimonials: { id: string; authorName: string; authorRole: string | null; organization: string | null; quote: string; isDemo: boolean }[] }>("/public/testimonials", { auth: false }), staleTime: 5 * 60_000 });
export const usePartners = () => useQuery({ queryKey: ["partners"], queryFn: () => api<{ partners: { id: string; name: string; kind: string; website: string | null; logoUrl: string | null }[] }>("/public/partners", { auth: false }), staleTime: 5 * 60_000 });
export const useFaq = () => useQuery({ queryKey: ["faq"], queryFn: () => api<{ items: { id: string; question: string; answer: string; audience: string }[] }>("/public/faq", { auth: false }), staleTime: 5 * 60_000 });
export const useSectors = () => useQuery({ queryKey: ["sectors"], queryFn: async () => { const r = await api<{ sectors: Sector[] }>("/public/sectors", { auth: false }); return { sectors: [...r.sectors].sort((a, b) => a.name.localeCompare(b.name, "fr")) }; }, staleTime: 30 * 60_000 });
/** Tri alphabétique français (accents), indépendant de la collation de la base. */
export const useSkills = () => useQuery({ queryKey: ["skills"], queryFn: async () => { const r = await api<{ skills: Skill[] }>("/public/skills", { auth: false }); return { skills: [...r.skills].sort((a, b) => a.name.localeCompare(b.name, "fr")) }; }, staleTime: 30 * 60_000 });
