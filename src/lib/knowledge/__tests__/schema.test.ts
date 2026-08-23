import { describe, it, expect } from "vitest";
import { knowledgeBrief } from "../brief";
import {
  ExtractionSchema,
  parseExtractionPayload,
  knowledgeSlug,
  refineBlock,
  refineTuning,
  TUNING_BOUNDS,
  type BlockProposal,
} from "../schema";
import { proposalRows } from "../store";
import { DEFAULT_TUNING } from "@/lib/engine";

const block: BlockProposal = {
  summary: "Sled push intervals",
  rationale: "The study reports repeated heavy pushes improve the sled split.",
  quote: "Repeated 25 m efforts at 80% of maximal load...",
  page: 7,
  confidence: 0.8,
  slug: "Sled Push Intervals!",
  block_type: "main",
  station: "sled_push",
  equipment_variant: "gym",
  difficulty_tier: 2,
  session_types: ["station_work"],
  tags: ["Sled", " legs "],
  content: [
    {
      exercise: "Sled push 25 m",
      sets: 5,
      reps: null,
      distance_m: 25,
      rest_sec: 90,
      load_open: "102 kg",
      load_pro: "152 kg",
    },
  ],
};

describe("knowledgeSlug", () => {
  it("namespaces and normalises whatever the model proposed", () => {
    expect(knowledgeSlug("Sled Push Intervals!")).toBe("kb_sled_push_intervals");
    expect(knowledgeSlug("kb_already_prefixed")).toBe("kb_already_prefixed");
  });
});

describe("refineBlock", () => {
  it("maps a proposal onto a workout_blocks row", () => {
    const res = refineBlock(block);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.slug).toBe("kb_sled_push_intervals");
    expect(res.value.session_types).toEqual(["station_work"]);
    expect(res.value.tags).toEqual(["sled", "legs"]);
    // Null fields are dropped; loads collapse into load_by_division (seed shape).
    expect(res.value.content[0]).toEqual({
      exercise: "Sled push 25 m",
      sets: 5,
      distance_m: 25,
      rest_sec: 90,
      load_by_division: { open: "102 kg", pro: "152 kg" },
    });
  });

  it("refuses a block the engine could not render", () => {
    expect(refineBlock({ ...block, content: [] })).toMatchObject({ ok: false });
    expect(refineBlock({ ...block, session_types: [] })).toMatchObject({ ok: false });
    expect(refineBlock({ ...block, difficulty_tier: 4 })).toMatchObject({ ok: false });
  });
});

describe("refineTuning", () => {
  it("accepts a known key inside its bounds", () => {
    expect(refineTuning("acwr_hard", 1.4)).toEqual({ ok: true, value: { key: "acwr_hard", value: 1.4 } });
  });

  it("refuses unknown keys, non-numbers and out-of-range values", () => {
    expect(refineTuning("drop_table", 1)).toMatchObject({ ok: false });
    expect(refineTuning("acwr_hard", "1.4" as unknown)).toMatchObject({ ok: false });
    expect(refineTuning("acwr_hard", 12)).toMatchObject({ ok: false });
    expect(refineTuning("pace_weekly_cap_pct", 0.9)).toMatchObject({ ok: false });
  });

  it("covers every tunable constant, and every default sits inside its bounds", () => {
    for (const key of Object.keys(DEFAULT_TUNING) as (keyof typeof DEFAULT_TUNING)[]) {
      const bounds = TUNING_BOUNDS[key];
      expect(bounds, `no bounds for ${key}`).toBeDefined();
      const value = DEFAULT_TUNING[key];
      expect(value, `${key} default outside bounds`).toBeGreaterThanOrEqual(bounds[0]);
      expect(value, `${key} default outside bounds`).toBeLessThanOrEqual(bounds[1]);
    }
  });
});

describe("proposalRows", () => {
  const extraction = ExtractionSchema.parse({
    document_summary: "Taper meta-analysis.",
    blocks: [block],
    tunings: [
      {
        summary: "Lower the hard ACWR ceiling",
        rationale: "Injury risk rises above 1.4 in the reviewed cohorts.",
        quote: "risk increased sharply above an acute:chronic ratio of 1.4",
        page: 12,
        confidence: 0.6,
        key: "acwr_hard",
        value: 1.4,
      },
    ],
    principles: [
      {
        summary: "Taper: cut volume, hold intensity",
        rationale: "Largest performance gains at 41-60% volume reduction.",
        quote: "reductions of 41-60% produced the largest gains",
        page: 3,
        confidence: 0.9,
        topic: "taper",
      },
    ],
  });

  it("flattens all three lists into pending rows that keep their evidence", () => {
    const rows = proposalRows("doc-1", extraction);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "pending" && r.document_id === "doc-1")).toBe(true);
    expect(rows.map((r) => r.kind)).toEqual(["block", "tuning", "principle"]);
    expect(rows[1].payload).toEqual({ key: "acwr_hard", value: 1.4 });
    expect(rows[2].page).toBe(3);
  });
});

describe("parseExtractionPayload — proposals that arrive finished", () => {
  const payload = {
    document_summary: "Analysis produced elsewhere.",
    blocks: [block],
    tunings: [
      {
        summary: "Lower the hard ACWR ceiling",
        rationale: "Injury risk rises above 1.4.",
        quote: "risk increased sharply above 1.4",
        page: 0,
        confidence: 0.6,
        key: "acwr_hard",
        value: 1.4,
      },
    ],
    principles: [
      {
        summary: "Taper: cut volume, hold intensity",
        rationale: "Largest gains at 41-60% volume reduction.",
        quote: "reductions of 41-60% produced the largest gains",
        page: 0,
        confidence: 0.9,
        topic: "taper",
      },
    ],
  };

  it("accepts a well-formed payload without running a model", () => {
    const { extraction, rejected } = parseExtractionPayload(payload, "own");
    expect(rejected).toEqual([]);
    expect(extraction.blocks).toHaveLength(1);
    expect(extraction.tunings[0].key).toBe("acwr_hard");
    expect(extraction.principles[0].topic).toBe("taper");
  });

  it("names what it rejected instead of dropping it silently", () => {
    const { extraction, rejected } = parseExtractionPayload(
      {
        blocks: [{ ...block, difficulty_tier: "hard" }],
        tunings: [{ ...payload.tunings[0], key: "drop_table" }],
        principles: "not a list",
      },
      "own",
    );
    expect(extraction.blocks).toHaveLength(0);
    expect(extraction.tunings).toHaveLength(0);
    expect(rejected.map((r) => r.list).sort()).toEqual(["blocks", "principles", "tunings"]);
    expect(rejected.find((r) => r.list === "blocks")?.error).toContain("difficulty_tier");
  });

  it("holds the copyright gate on this path too", () => {
    const { extraction, rejected } = parseExtractionPayload(payload, "research_only");
    expect(extraction.blocks).toEqual([]);
    expect(extraction.tunings).toHaveLength(1);
    expect(rejected[0].error).toContain("research_only");
  });

  it("treats junk as empty rather than throwing", () => {
    expect(parseExtractionPayload(null, "own").extraction.principles).toEqual([]);
    expect(parseExtractionPayload("nope", "own").extraction.blocks).toEqual([]);
  });
});

describe("knowledgeBrief", () => {
  const brief = knowledgeBrief();

  it("hands out every tuning key with the bounds the validator enforces", () => {
    for (const [key, [min, max]] of Object.entries(TUNING_BOUNDS)) {
      expect(brief).toContain(key);
      expect(brief).toContain(`(${min} … ${max})`);
    }
  });

  it("lists the enums an external AI has to hit exactly", () => {
    for (const type of ["station_work", "compromised_run", "full_sim"]) expect(brief).toContain(type);
    for (const station of ["sled_push", "wall_balls"]) expect(brief).toContain(station);
    expect(brief).toContain("COPYRIGHT RULE");
  });

  it("ships an example that the app itself accepts — contract and validator cannot drift", () => {
    const start = brief.indexOf("{", brief.indexOf("SHAPE"));
    const example = JSON.parse(brief.slice(start));
    const { extraction, rejected } = parseExtractionPayload(example, "own");
    expect(rejected).toEqual([]);
    expect(extraction.blocks).toHaveLength(1);
    expect(extraction.tunings).toHaveLength(1);
    expect(extraction.principles).toHaveLength(1);
  });
});
