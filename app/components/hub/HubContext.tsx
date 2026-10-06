import { Suspense } from "react";
import { isPillarKey } from "../../../src/lib/pillars";
import { BilancioView } from "../../bilancio/BilancioView";
import { CostiView } from "../../costi/CostiView";
import { OggiView } from "../../views/OggiView";
import { PalestraView } from "../../palestra/PalestraView";
import { SaluteView } from "../../salute/SaluteView";
import { SpesaView } from "../../spesa/SpesaView";
import { UniView } from "../../uni/UniView";
import { InsightsView } from "../../insights/InsightsView";
import { PassaggiView } from "../../passaggi/PassaggiView";
import { WidgetBoundary } from "./WidgetBoundary";
import { AiraPanel, KnowledgePanel, ProfilePanel, MoodPanel, PillsPanel, Skeleton, SocialQuickLog, WorkTracker } from "./widgets";

const S = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <WidgetBoundary label={label}>
    <Suspense fallback={<Skeleton label={label} />}>{children}</Suspense>
  </WidgetBoundary>
);

/**
 * La pagina modulare: ogni contesto è una lista di widget, ciascuno in un proprio Suspense, così la
 * pagina si compone man mano e un widget lento non blocca gli altri. Senza contesto: la panoramica (Oggi).
 */
export interface HubParams {
  date?: string;
  path?: string;
  exercise?: string;
}

export function HubContext({ context, params = {} }: { context: string | undefined; params?: HubParams }) {
  if (context === "incroci") {
    return (
      <S label="Incroci">
        <InsightsView />
      </S>
    );
  }
  if (context === "passaggi") {
    return (
      <S label="Passaggi">
        <PassaggiView />
      </S>
    );
  }
  if (context === "aira") {
    return (
      <>
        <S label="Stato di Aira"><AiraPanel /></S>
        <S label="Profilo"><ProfilePanel /></S>
        <S label="Costi AI"><CostiView /></S>
      </>
    );
  }
  if (!isPillarKey(context)) {
    return (
      <S label="Oggi">
        <OggiView />
      </S>
    );
  }
  switch (context) {
    case "studio":
      return (
        <>
          <S label="Università"><UniView path={params.path} /></S>
          <S label="Cultura"><KnowledgePanel /></S>
          <S label="Pillole"><PillsPanel /></S>
        </>
      );
    case "salute":
      return (
        <>
          <S label="Salute"><SaluteView date={params.date} /></S>
          <S label="Bilancio"><BilancioView /></S>
          <S label="Spesa"><SpesaView /></S>
        </>
      );
    case "allenamento":
      return (
        <>
          <S label="Allenamento"><PalestraView exercise={params.exercise} /></S>
        </>
      );
    case "umore":
      return (
        <>
          <SocialQuickLog />
          <S label="Umore"><MoodPanel /></S>
        </>
      );
    case "lavoro":
      return (
        <>
          <S label="Ore"><WorkTracker /></S>
        </>
      );
  }
}
