-- CreateEnum
CREATE TYPE "PaymentEventKind" AS ENUM ('VIREMENT_DECLARE', 'DEPOT_CONFIRME', 'DEPOT_REJETE', 'LIBERATION_ENREGISTREE', 'REMBOURSEMENT_ENREGISTRE');

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "kind" "PaymentEventKind" NOT NULL,
    "method" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "recordedBy" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_externalId_key" ON "PaymentEvent"("externalId");

-- CreateIndex
CREATE INDEX "PaymentEvent_escrowId_createdAt_idx" ON "PaymentEvent"("escrowId", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "Escrow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
