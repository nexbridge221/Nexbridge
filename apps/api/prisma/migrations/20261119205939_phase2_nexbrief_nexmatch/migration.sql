-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SOUMISE', 'PRE_SELECTIONNEE', 'ACCEPTEE', 'REFUSEE', 'RETIREE');

-- CreateEnum
CREATE TYPE "ApplicationSource" AS ENUM ('LIBRE', 'NEXMATCH');

-- CreateEnum
CREATE TYPE "TeamOrigin" AS ENUM ('NEXMATCH', 'MANUELLE');

-- CreateEnum
CREATE TYPE "TeamStatus" AS ENUM ('EN_VALIDATION', 'VALIDEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "TeamMemberStatus" AS ENUM ('INVITE', 'ACCEPTE', 'DECLINE', 'EXPIRE', 'REMPLACE');

-- CreateEnum
CREATE TYPE "ValidationStep" AS ENUM ('ENTREPRISE', 'ETUDIANTS', 'ACADEMIQUE');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('EN_ATTENTE', 'VALIDE', 'REFUSE', 'NON_REQUIS');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANIFIE', 'EN_COURS', 'EN_PAUSE', 'TERMINE', 'ANNULE');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('CONTACT_ENTREPRISE', 'CHEF_PROJET', 'ETUDIANT', 'MENTOR', 'REFERENT');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('NON_DEPOSE', 'DEPOSE', 'LIBERE', 'REMBOURSE');

-- CreateEnum
CREATE TYPE "DeliverableFormat" AS ENUM ('RAPPORT', 'PROTOTYPE', 'CODE', 'PRESENTATION', 'AUTRE');

-- CreateTable
CREATE TABLE "ChallengeDeliverable" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "format" "DeliverableFormat" NOT NULL DEFAULT 'RAPPORT',
    "description" TEXT,

    CONSTRAINT "ChallengeDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeMilestone" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetWeek" INTEGER NOT NULL,

    CONSTRAINT "ChallengeMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeReview" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "checklist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeStatusHistory" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "from" "ChallengeStatus",
    "to" "ChallengeStatus" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BriefTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "motivation" TEXT,
    "source" "ApplicationSource" NOT NULL DEFAULT 'LIBRE',
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SOUMISE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRun" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "ranking" JSONB NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchProposal" (
    "id" TEXT NOT NULL,
    "matchRunId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "diversityScore" INTEGER NOT NULL,
    "explanation" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSEE',

    CONSTRAINT "MatchProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchProposalMember" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "skillScores" JSONB NOT NULL,
    "penalties" JSONB NOT NULL,

    CONSTRAINT "MatchProposalMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "origin" "TeamOrigin" NOT NULL,
    "status" "TeamStatus" NOT NULL DEFAULT 'EN_VALIDATION',
    "proposalId" TEXT,
    "matchRunId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "status" "TeamMemberStatus" NOT NULL DEFAULT 'INVITE',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "lastReminderAt" TIMESTAMP(3),
    "replacedById" TEXT,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamValidationStep" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "step" "ValidationStep" NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "actorId" TEXT,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "TeamValidationStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANIFIE',
    "startDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "budgetAmount" BIGINT,
    "budgetCurrency" "Currency" NOT NULL DEFAULT 'XOF',
    "milestoneRule" TEXT NOT NULL DEFAULT 'LES_DEUX',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectRole" "ProjectRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escrow" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "amountHeld" BIGINT NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'XOF',
    "status" "EscrowStatus" NOT NULL DEFAULT 'NON_DEPOSE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Escrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ChallengeDeliverable_challengeId_idx" ON "ChallengeDeliverable"("challengeId");

-- CreateIndex
CREATE INDEX "ChallengeMilestone_challengeId_idx" ON "ChallengeMilestone"("challengeId");

-- CreateIndex
CREATE INDEX "ChallengeReview_challengeId_idx" ON "ChallengeReview"("challengeId");

-- CreateIndex
CREATE INDEX "ChallengeStatusHistory_challengeId_at_idx" ON "ChallengeStatusHistory"("challengeId", "at");

-- CreateIndex
CREATE INDEX "Application_studentId_idx" ON "Application"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_challengeId_studentId_key" ON "Application"("challengeId", "studentId");

-- CreateIndex
CREATE INDEX "MatchRun_challengeId_createdAt_idx" ON "MatchRun"("challengeId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchProposal_matchRunId_idx" ON "MatchProposal"("matchRunId");

-- CreateIndex
CREATE INDEX "MatchProposalMember_proposalId_idx" ON "MatchProposalMember"("proposalId");

-- CreateIndex
CREATE INDEX "Team_challengeId_status_idx" ON "Team"("challengeId", "status");

-- CreateIndex
CREATE INDEX "TeamMember_studentId_status_idx" ON "TeamMember"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_studentId_key" ON "TeamMember"("teamId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamValidationStep_teamId_step_key" ON "TeamValidationStep"("teamId", "step");

-- CreateIndex
CREATE UNIQUE INDEX "Project_challengeId_key" ON "Project"("challengeId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_teamId_key" ON "Project"("teamId");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Escrow_projectId_key" ON "Escrow"("projectId");

-- AddForeignKey
ALTER TABLE "ChallengeDeliverable" ADD CONSTRAINT "ChallengeDeliverable_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeMilestone" ADD CONSTRAINT "ChallengeMilestone_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeReview" ADD CONSTRAINT "ChallengeReview_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeStatusHistory" ADD CONSTRAINT "ChallengeStatusHistory_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRun" ADD CONSTRAINT "MatchRun_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchProposal" ADD CONSTRAINT "MatchProposal_matchRunId_fkey" FOREIGN KEY ("matchRunId") REFERENCES "MatchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchProposalMember" ADD CONSTRAINT "MatchProposalMember_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MatchProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MatchProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamValidationStep" ADD CONSTRAINT "TeamValidationStep_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
