// Decorative 3D map of the UK for the landing hero: CSS 3D + inline SVG, no map library.
// Geometry: lon/lat projected into a 700 x 1052 box. Styles live in src/styles.css (.uk-*).

const VIEWBOX = "0 0 700 1052";

const GB_PATH =
  "M181 1021L215 1034L225 1012L242 1004L266 991L287 987L320 1004L330 965L337 957L368 946L400 969L434 960L438 946L461 946L491 939L513 946L556 934L582 943L604 931L631 924L653 900L662 869L635 871L617 861L614 852L643 822L652 805L656 802L673 780L678 760L683 742L682 728L669 703L653 690L623 686L598 688L591 705L572 694L582 676L589 666L582 643L563 617L573 616L567 598L553 557L560 553L538 534L524 510L488 495L486 487L472 461L470 449L464 436L460 413L450 380L431 362L396 335L382 328L351 338L315 328L337 332L353 323L376 313L391 303L372 283L365 282L384 277L392 271L400 253L409 244L417 224L426 203L446 162L431 140L396 142L366 141L345 136L305 151L283 162L296 141L293 125L289 116L300 110L320 90L357 53L361 30L338 27L328 35L295 35L246 38L229 31L225 52L213 87L218 116L182 136L174 170L180 187L173 220L147 251L195 289L190 325L182 358L178 402L175 415L192 401L205 362L225 353L234 341L245 341L238 360L241 377L250 388L254 398L238 423L218 451L238 494L269 487L293 471L323 457L357 457L330 483L324 503L320 510L335 526L348 554L372 558L360 587L361 607L363 636L351 637L355 653L337 643L315 647L305 643L277 634L249 647L273 671L245 706L293 715L290 750L251 784L209 809L225 832L249 836L276 832L276 848L300 844L310 846L343 868L353 861L367 850L387 844L365 873L357 888L332 889L288 889L260 911L259 933L245 952L232 965L222 980L197 1005Z";

const NI_PATH =
  "M175 468L158 428L145 427L118 427L98 428L81 445L73 452L63 471L22 511L79 546L121 558L139 547L155 561L163 560L197 528L193 491L184 490L168 495L175 483Z";

const ROUTE_LINES =
  "M391 861L557 854M391 861L351 858M438 742L351 858M438 742L557 854M364 635L415 627M364 635L466 638M461 590L466 638M461 590L415 627M351 341L279 351M351 341L457 453M415 627L457 453M279 351L415 627M424 202L281 164M279 351L281 164M424 202L351 341M557 854L653 725M557 854L471 925M287 986L471 925M653 725L287 986M166 497L279 351M279 351L364 635M351 858L364 635M166 497L351 858";

type Pin = { name: string; left: number; top: number; delay: number; label?: boolean };

// left/top are percentages of the map plane.
const PINS: Pin[] = [
  { name: "London", left: 79.6, top: 81.2, delay: 0, label: true },
  { name: "Bristol", left: 55.9, top: 81.9, delay: -0.8 },
  { name: "Cardiff", left: 50.2, top: 81.6, delay: -1.6, label: true },
  { name: "Birmingham", left: 62.5, top: 70.6, delay: -2.4, label: true },
  { name: "Manchester", left: 59.2, top: 59.6, delay: -0.4, label: true },
  { name: "Liverpool", left: 52, top: 60.3, delay: -1.2 },
  { name: "Sheffield", left: 66.6, top: 60.7, delay: -2 },
  { name: "Leeds", left: 65.9, top: 56.1, delay: -2.8, label: true },
  { name: "Glasgow", left: 39.9, top: 33.4, delay: -0.6, label: true },
  { name: "Edinburgh", left: 50.1, top: 32.4, delay: -1.4, label: true },
  { name: "Newcastle", left: 65.3, top: 43.1, delay: -2.2, label: true },
  { name: "Aberdeen", left: 60.6, top: 19.2, delay: -3, label: true },
  { name: "Inverness", left: 40.2, top: 15.6, delay: -1 },
  { name: "Plymouth", left: 41, top: 93.8, delay: -1.8, label: true },
  { name: "Southampton", left: 67.3, top: 87.9, delay: -2.6 },
  { name: "Belfast", left: 23.8, top: 47.3, delay: -0.2, label: true },
  { name: "Norwich", left: 93.3, top: 68.9, delay: -1.1 },
];

type Mover = { id: "a" | "b" | "c"; kind: string; title: string; status: string };

// Sample businesses, for illustration only. Their routes are the uk-route-* keyframes in styles.css.
const MOVERS: Mover[] = [
  { id: "a", kind: "Sole trader", title: "Joiner", status: "Books balanced" },
  { id: "b", kind: "Limited company", title: "Bakery", status: "VAT records ready" },
  { id: "c", kind: "Limited company", title: "Design studio", status: "Year-end ready" },
];

function Tick() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Shape({ className }: { className: string }) {
  return (
    <>
      <path d={GB_PATH} className={className} />
      <path d={NI_PATH} className={className} />
    </>
  );
}

export function UkMapHero() {
  return (
    <div className="uk-stage">
      <p className="sr-only">
        Illustration: a 3D map of the United Kingdom with sample businesses moving between cities.
      </p>

      <div className="uk-plane" aria-hidden="true">
        <div className="uk-grid" />

        {/* three stacked, darker copies of the outline give the map its thickness */}
        <svg viewBox={VIEWBOX} className="uk-layer uk-layer-0">
          <Shape className="uk-fill-0" />
        </svg>
        <svg viewBox={VIEWBOX} className="uk-layer uk-layer-1">
          <Shape className="uk-fill-1" />
        </svg>
        <svg viewBox={VIEWBOX} className="uk-layer uk-layer-2">
          <Shape className="uk-fill-2" />
        </svg>

        {/* top face: dotted fill, glowing edge, flowing route lines */}
        <svg viewBox={VIEWBOX} className="uk-layer">
          <defs>
            <pattern id="uk-dots" width="13" height="13" patternUnits="userSpaceOnUse">
              <circle cx="6.5" cy="6.5" r="2" className="uk-dot-fill" />
            </pattern>
          </defs>
          {[GB_PATH, NI_PATH].map((d, i) => (
            <g key={i}>
              <path d={d} className="uk-top-fill" />
              <path d={d} fill="url(#uk-dots)" opacity="0.85" />
              <path d={d} className="uk-top-edge" />
            </g>
          ))}
          <path d={ROUTE_LINES} className="uk-route uk-flow" />
        </svg>

        {PINS.map((p) => (
          <div key={p.name} className="uk-pin" style={{ left: `${p.left}%`, top: `${p.top}%` }}>
            <span className="uk-ring" style={{ animationDelay: `${p.delay}s` }} />
            <span className="uk-dot" />
            {p.label && <span className="uk-bb uk-label">{p.name}</span>}
          </div>
        ))}

        {MOVERS.map((m) => (
          <div key={m.id} className={`uk-mover uk-mover-${m.id}`}>
            <span className="uk-shadow" />
            <div className={`uk-hop uk-hop-${m.id}`}>
              <div className="uk-bb uk-card">
                <p className="uk-card-kind">{m.kind}</p>
                <p className="uk-card-title">{m.title}</p>
                <p className="uk-card-status">
                  <Tick />
                  {m.status}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="absolute inset-x-0 bottom-1 m-0 px-4 text-center text-xs text-land-fog">
        Sample businesses, shown for illustration. Not real customers.
      </p>
    </div>
  );
}
