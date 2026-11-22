import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toast";
import { AuthLayout } from "@/layouts/AuthLayout";
import { PublicLayout } from "@/layouts/PublicLayout";
import { RequireAuth, RequireRole } from "@/layouts/AppLayout";
import { Skeleton } from "@/components/ui/misc";
import { useAuth } from "@/stores/auth";
import Home from "@/pages/public/Home";

// Découpage du code par route (connexions limitées) : seule la page d'accueil est dans le bundle initial.
const lazyNamed = <T extends Record<string, React.ComponentType<never>>>(loader: () => Promise<T>, name: keyof T) => lazy(async () => ({ default: (await loader())[name] as React.ComponentType }));
const HowPage = lazyNamed(() => import("@/pages/public/InfoPages"), "HowPage");
const ContactPage = lazyNamed(() => import("@/pages/public/InfoPages"), "ContactPage");
const FaqPage = lazyNamed(() => import("@/pages/public/InfoPages"), "FaqPage");
const SolutionPage = lazyNamed(() => import("@/pages/public/InfoPages"), "SolutionPage");
const CompaniesPage = lazy(() => import("@/pages/public/InfoPages").then((m) => ({ default: () => <m.AudiencePage k="companies" /> })));
const StudentsPage = lazy(() => import("@/pages/public/InfoPages").then((m) => ({ default: () => <m.AudiencePage k="students" /> })));
const InstitutionsPage = lazy(() => import("@/pages/public/InfoPages").then((m) => ({ default: () => <m.AudiencePage k="institutions" /> })));
const MentorsPage = lazy(() => import("@/pages/public/InfoPages").then((m) => ({ default: () => <m.AudiencePage k="mentors" /> })));
const ProjectsPage = lazyNamed(() => import("@/pages/public/Projects"), "ProjectsPage");
const ProjectDetailPage = lazyNamed(() => import("@/pages/public/Projects"), "ProjectDetailPage");
const NotFound = lazyNamed(() => import("@/pages/public/NotFound"), "NotFound");
const Legal = (k: "mentions" | "cgu" | "confidentialite" | "cookies") => lazy(() => import("@/pages/public/LegalPages").then((m) => ({ default: () => <m.LegalPage k={k} /> })));
const Mentions = Legal("mentions"), Cgu = Legal("cgu"), Privacy = Legal("confidentialite"), Cookies = Legal("cookies");
const Login = lazy(() => import("@/pages/auth/Login"));
const Register = lazy(() => import("@/pages/auth/Register"));
const ForgotPassword = lazyNamed(() => import("@/pages/auth/Recovery"), "ForgotPassword");
const ResetPassword = lazyNamed(() => import("@/pages/auth/Recovery"), "ResetPassword");
const VerifyEmail = lazyNamed(() => import("@/pages/auth/Recovery"), "VerifyEmail");
const Dashboard = lazy(() => import("@/pages/app/Dashboard"));
const Onboarding = lazy(() => import("@/pages/app/Onboarding"));
const Profile = lazy(() => import("@/pages/app/Profile"));
const Organisation = lazy(() => import("@/pages/app/Organisation"));
const Settings = lazy(() => import("@/pages/app/Settings"));
const Notifications = lazy(() => import("@/pages/app/Notifications"));
const ComingSoon = lazy(() => import("@/pages/app/ComingSoon"));
const AdminHome = lazy(() => import("@/pages/app/AdminHome"));
const ChallengesList = lazy(() => import("@/pages/app/defis/List"));
const NewChallenge = lazy(() => import("@/pages/app/defis/New"));
const ChallengeWizard = lazy(() => import("@/pages/app/defis/Wizard"));
const ChallengeDetail = lazy(() => import("@/pages/app/defis/Detail"));
const Applications = lazy(() => import("@/pages/app/Applications"));
const AcademicValidations = lazy(() => import("@/pages/app/Academic"));
const AdminChallenges = lazy(() => import("@/pages/app/admin/AdminChallenges"));
const AdminOrganisations = lazy(() => import("@/pages/app/admin/AdminOrganisations"));
const AdminProjects = lazy(() => import("@/pages/app/admin/AdminProjects"));
const AdminUsers = lazy(() => import("@/pages/app/admin/AdminUsers"));
const AdminCatalog = lazy(() => import("@/pages/app/admin/AdminCatalog"));
const AdminModeration = lazy(() => import("@/pages/app/admin/AdminModeration"));
const AdminAudit = lazy(() => import("@/pages/app/admin/AdminAudit"));
const AdminContent = lazy(() => import("@/pages/app/admin/AdminContent"));
const AdminSettings = lazy(() => import("@/pages/app/admin/AdminSettings"));
const AdminPayments = lazy(() => import("@/pages/app/admin/AdminPayments"));
const SpacePayment = lazy(() => import("@/pages/app/projets/Payment"));
const Badges = lazy(() => import("@/pages/app/Badges"));
const AcademicHub = lazy(() => import("@/pages/app/AcademicHub"));
const SpaceEvaluation = lazy(() => import("@/pages/app/projets/Evaluation"));
const PortfolioPage = lazyNamed(() => import("@/pages/public/PublicPilot"), "PortfolioPage");
const VerifyPage = lazyNamed(() => import("@/pages/public/PublicPilot"), "VerifyPage");
const ProjectsList = lazy(() => import("@/pages/app/projets/List"));
const ProjectLayout = lazy(() => import("@/pages/app/projets/ProjectLayout"));
const SpaceOverview = lazy(() => import("@/pages/app/projets/Overview"));
const SpaceTasks = lazy(() => import("@/pages/app/projets/Tasks"));
const SpaceMilestones = lazy(() => import("@/pages/app/projets/Milestones"));
const SpaceDocuments = lazy(() => import("@/pages/app/projets/Documents"));
const SpaceMessages = lazy(() => import("@/pages/app/projets/Messages"));
const SpaceDeliverables = lazy(() => import("@/pages/app/projets/Deliverables"));
const SpaceMeetings = lazy(() => import("@/pages/app/projets/Meetings"));
const SpaceActivity = lazyNamed(() => import("@/pages/app/projets/Misc"), "Activity");
const SpaceTeam = lazyNamed(() => import("@/pages/app/projets/Misc"), "Team");
const SpaceReports = lazyNamed(() => import("@/pages/app/projets/Misc"), "Reports");
const MentorProjects = lazyNamed(() => import("@/pages/app/projets/Misc"), "MentorProjects");

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const Fallback = () => <div className="nb-container space-y-4 py-16" aria-busy="true"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-4" /><Skeleton className="h-4 w-2/3" /></div>;

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<Home />} />
              <Route path="comment-ca-marche" element={<HowPage />} />
              <Route path="entreprises" element={<CompaniesPage />} />
              <Route path="etudiants" element={<StudentsPage />} />
              <Route path="etablissements" element={<InstitutionsPage />} />
              <Route path="experts-mentors" element={<MentorsPage />} />
              <Route path="solutions/:slug" element={<SolutionPage />} />
              <Route path="projets" element={<ProjectsPage />} />
              <Route path="projets/:slug" element={<ProjectDetailPage />} />
              <Route path="portfolio/:slug" element={<PortfolioPage />} />
              <Route path="verifier" element={<VerifyPage />} />
              <Route path="verifier/:code" element={<VerifyPage />} />
              <Route path="faq" element={<FaqPage />} />
              <Route path="contact" element={<ContactPage />} />
              <Route path="mentions-legales" element={<Mentions />} />
              <Route path="cgu" element={<Cgu />} />
              <Route path="confidentialite" element={<Privacy />} />
              <Route path="cookies" element={<Cookies />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route element={<AuthLayout />}>
              <Route path="connexion" element={<Login />} />
              <Route path="inscription" element={<Register />} />
              <Route path="mot-de-passe-oublie" element={<ForgotPassword />} />
              <Route path="reinitialiser-mot-de-passe" element={<ResetPassword />} />
              <Route path="verification-email" element={<VerifyEmail />} />
            </Route>
            <Route path="app" element={<RequireAuth />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="onboarding" element={<Onboarding />} />
              <Route path="profil" element={<Profile />} />
              <Route path="organisation" element={<Organisation />} />
              <Route path="parametres" element={<Settings />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="defis" element={<ChallengesList />} />
              <Route path="defis/nouveau" element={<NewChallenge />} />
              <Route path="defis/:id" element={<ChallengeDetail />} />
              <Route path="defis/:id/nexmatch" element={<ChallengeDetail />} />
              <Route path="defis/:id/modifier" element={<ChallengeWizard />} />
              <Route path="candidatures" element={<Applications />} />
              <Route path="projets" element={<ProjectsList />} />
              <Route path="projets/:id" element={<ProjectLayout />}>
                <Route index element={<SpaceOverview />} />
                <Route path="taches" element={<SpaceTasks />} />
                <Route path="jalons" element={<SpaceMilestones />} />
                <Route path="documents" element={<SpaceDocuments />} />
                <Route path="messages" element={<SpaceMessages />} />
                <Route path="livrables" element={<SpaceDeliverables />} />
                <Route path="reunions" element={<SpaceMeetings />} />
                <Route path="activite" element={<SpaceActivity />} />
                <Route path="equipe" element={<SpaceTeam />} />
                <Route path="rapports" element={<SpaceReports />} />
                <Route path="evaluation" element={<SpaceEvaluation />} />
                <Route path="paiement" element={<SpacePayment />} />
              </Route>
              <Route path="badges" element={<Badges />} />
              <Route path="academique" element={<AcademicHub />} />
              <Route path="mentor/projets" element={<MentorProjects />} />
              <Route path="academique/validations" element={<AcademicValidations />} />
              <Route element={<RequireRole roles={["ADMIN", "SUPER_ADMIN"]} />}>
                <Route path="admin/tableau-de-bord" element={<AdminHome />} />
                <Route path="admin/defis" element={<AdminChallenges />} />
                <Route path="admin/organisations" element={<AdminOrganisations />} />
                <Route path="admin/projets" element={<AdminProjects />} />
                <Route path="admin/utilisateurs" element={<AdminUsers />} />
                <Route path="admin/catalogue" element={<AdminCatalog />} />
                <Route path="admin/moderation" element={<AdminModeration />} />
                <Route path="admin/contenus" element={<AdminContent />} />
                <Route path="admin/paiements" element={<AdminPayments />} />
                <Route element={<RequireRole roles={["SUPER_ADMIN"]} />}>
                  <Route path="admin/audit" element={<AdminAudit />} />
                  <Route path="admin/configuration" element={<AdminSettings />} />
                </Route>
              </Route>
              <Route path="bientot/:key" element={<ComingSoon />} />
              <Route path="*" element={<Navigate to="dashboard" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
