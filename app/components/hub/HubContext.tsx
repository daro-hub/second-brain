import { Suspense } from "react";
import { PILLAR_META, getPillar, isPillarKey, type PillarKey } from "../../../src/lib/pillars";
import { BilancioView } from "../../bilancio/BilancioView";
import { CostiView } from "../../costi/CostiView";
import { OggiView } from "../../views/OggiView";
import { PalestraView } from "../../palestra/PalestraView";
import { SaluteView } from "../../salute/SaluteView";
import { SpesaView } from "../../spesa/SpesaView";
import { UniView } from "../../uni/UniView";
import { WidgetBoundary } from "./WidgetBoundary";
import { AiraPanel, KnowledgePanel, MeasureGrid, Skeleton, SocialQuickLog, WorkPanel } from "./widgets";

async function Measures({ k }: { k: PillarKey }) {
  return <MeasureGrid pillar={await getPillar(k)} />;
}

const S = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <WidgetBoundary label={label}>
    <Suspense fallback={<Skeleton label={label} />}>{children}</Suspense>
  </WidgetBoundary>
);

/**
 * La pagina modulare: ogni contesto è una lista di widget, ciascuno in un proprio Suspense, così la
 * pagina si compone man mano e un widget lento non blocca gli altri. Senza contesto: la panoramica (Oggi).
 */
export function HubContext({ context }: { context: string | undefined }) {
  if (context === "aira") {
    return (
      <>
        <S label="Stato di Aira"><AiraPanel /></S>
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
  const measures = (
    <S label={`Misure ${PILLAR_META[context].label}`}>
      <Measures k={context} />
    </S>
  );
  switch (context) {
    case "studio":
      return (
        <>
          {measures}
          <S label="Università"><UniView /></S>
        </>
      );
    case "salute":
      return (
        <>
          {measures}
          <SocialQuickLog />
          <S label="Salute"><SaluteView /></S>
          <S label="Bilancio"><BilancioView /></S>
          <S label="Spesa"><SpesaView /></S>
        </>
      );
    case "allenamento":
      return (
        <>
          {measures}
          <S label="Allenamento"><PalestraView /></S>
        </>
      );
    case "conoscenza":
      return (
        <>
          {measures}
          <S label="Conoscenza"><KnowledgePanel /></S>
        </>
      );
    case "lavoro":
      return (
        <>
          {measures}
          <S label="Lavoro"><WorkPanel /></S>
        </>
      );
  }
}
