import {
  Shikhara,
  Mandapa,
  Gopuram,
  Colonnade,
  Haveli,
  Jharokha,
  FlagMast,
  Kadamba,
  Tulsi,
  Peacock,
} from "./braj-skyline-parts";

/**
 * The Braj skyline behind the hero.
 *
 * A stretch of Vrindavan as it actually stands: rekha-shikhara temples in the
 * Nagara manner (Madan Mohan, Govind Dev, Prem Mandir), Rangji's seven-storeyed
 * Dravidian gopuram with its tall dhwaja stambha, phamsana mandapa halls,
 * arcaded courtyards, and the jharokha-fronted havelis of Loi Bazaar — with
 * kadamba trees, a tulsi pot and a peacock on the parapet.
 *
 * Three depth layers, each one flat opaque tone (see layout.css). No opacity is
 * used anywhere, so overlapping silhouettes never darken one another.
 */
export default function BrajSkyline() {
  return (
    <svg
      className="braj-skyline"
      viewBox="0 0 1440 360"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      {/* ---------------- far: spires across the dham ---------------- */}
      <g className="braj-skyline__far">
        <Shikhara
          cx={118}
          base={334}
          w={44}
          h={132}
          cluster={false}
          detail={false}
        />
        <Mandapa cx={210} base={334} w={54} h={84} tiers={4} detail={false} />
        <Shikhara
          cx={352}
          base={334}
          w={38}
          h={108}
          cluster={false}
          detail={false}
        />
        <Shikhara
          cx={640}
          base={334}
          w={40}
          h={118}
          cluster={false}
          detail={false}
        />
        <Mandapa cx={840} base={334} w={50} h={76} tiers={4} detail={false} />
        <Shikhara
          cx={1076}
          base={334}
          w={42}
          h={124}
          cluster={false}
          detail={false}
        />
        <Mandapa cx={1168} base={334} w={48} h={72} tiers={4} detail={false} />
        <Shikhara
          cx={1392}
          base={334}
          w={40}
          h={114}
          cluster={false}
          detail={false}
        />
      </g>

      {/* ---------------- mid: the temple town ---------------- */}
      <g className="braj-skyline__mid">
        {/* Loi Bazaar end — havelis and a small hall */}
        <Haveli x={52} base={360} width={148} h={104} windows={3} />
        <Mandapa cx={258} base={360} w={74} h={126} tiers={5} />

        {/* the courtyard arcade leading to the great temple */}
        <Colonnade x={312} base={360} width={176} h={96} bays={4} twoStorey />
        <Jharokha cx={356} y={280} w={24} />
        <Jharokha cx={444} y={280} w={24} />

        {/* the great temple — shikhara, its urushringa cluster, and the hall */}
        <FlagMast cx={520} base={360} h={206} />
        <Shikhara cx={640} base={360} w={112} h={258} />
        <Mandapa cx={782} base={360} w={104} h={168} tiers={6} />
        <Colonnade x={846} base={360} width={150} h={84} bays={3} />

        {/* Rangji — the Dravidian gopuram and its mast */}
        <Gopuram cx={1074} base={360} w={116} h={238} talas={7} />
        <FlagMast cx={988} base={360} h={158} />

        {/* the far courtyard and the bazaar closing the street */}
        <Colonnade x={1146} base={360} width={140} h={80} bays={3} />
        <Shikhara cx={1330} base={360} w={72} h={176} />
        <Haveli x={1382} base={360} width={130} h={96} windows={2} />
      </g>

      {/* ---------------- near: the lane itself ---------------- */}
      <g className="braj-skyline__near">
        <Kadamba cx={22} base={360} h={158} />
        <Tulsi cx={300} base={360} h={54} />
        <Peacock cx={470} base={258} s={0.8} />
        <Kadamba cx={936} base={360} h={126} />
        <Tulsi cx={1140} base={360} h={46} />
        <Kadamba cx={1428} base={360} h={146} />
      </g>
    </svg>
  );
}
