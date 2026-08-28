import test from "node:test";
import assert from "node:assert/strict";
import {
  slugify,
  safeFilename,
  createSession,
  transitionSession,
  createMarker,
  mergeRanges,
  subtractRanges,
  markerWindows,
  buildRenderPlan,
  chooseMimeType,
  qualityPreset,
  containRect,
  mapClientPoint,
  chunkRanges,
  isRetryableStatus,
  formatDuration,
  formatBytes,
  buildManifest
} from "../core.mjs";
import {
  parseArguments,
  validateSegments,
  ffmpegSegmentArgs,
  concatListContent
} from "../worker/render-worker.mjs";

test("slugify removes Vietnamese accents and unsafe characters", () => {
  assert.equal(slugify("Buổi Học: Ánh Sáng & Bố Cục!"), "buoi-hoc-anh-sang-bo-cuc");
});

test("safeFilename normalises extension", () => {
  assert.equal(safeFilename("Bài giảng cuối.MOV", ".webm"), "bai-giang-cuoi.webm");
});

test("createSession creates stable schema and draft state", () => {
  const session = createSession("Lớp K41", 1000, () => 0.5);
  assert.equal(session.schemaVersion, 1);
  assert.equal(session.state, "draft");
  assert.match(session.id, /^session-1000-/);
});

test("session transition accepts valid state change", () => {
  const session = createSession("Test", 1000, () => 0);
  assert.equal(transitionSession(session, "recording", 2000).state, "recording");
});

test("session transition rejects invalid state change", () => {
  const session = createSession("Test", 1000, () => 0);
  assert.throws(() => transitionSession(session, "uploaded"), /Không thể chuyển/);
});

test("createMarker validates type and rounds time", () => {
  assert.equal(createMarker("important", 12.34567, "", 1000).at, 12.346);
  assert.throws(() => createMarker("unknown", 1), /không hợp lệ/);
});

test("mergeRanges joins overlaps and near-adjacent ranges", () => {
  assert.deepEqual(
    mergeRanges([{ start: 3, end: 5 }, { start: 1, end: 3.05 }, { start: 8, end: 9 }]),
    [{ start: 1, end: 5 }, { start: 8, end: 9 }]
  );
});

test("subtractRanges splits master around cut windows", () => {
  assert.deepEqual(
    subtractRanges([{ start: 0, end: 20 }], [{ start: 4, end: 6 }, { start: 10, end: 13 }]),
    [{ start: 0, end: 4 }, { start: 6, end: 10 }, { start: 13, end: 20 }]
  );
});

test("markerWindows clamps windows to recording duration", () => {
  const windows = markerWindows([
    { type: "important", at: 2 },
    { type: "cut", at: 29 }
  ], 30);
  assert.deepEqual(windows.important, [{ start: 0, end: 12 }]);
  assert.deepEqual(windows.cut, [{ start: 27, end: 30 }]);
});

test("render plan removes cut regions from master and highlight", () => {
  const plan = buildRenderPlan({
    duration: 60,
    sessionId: "s1",
    markers: [{ type: "important", at: 20 }, { type: "cut", at: 21 }]
  });
  assert.equal(plan.sessionId, "s1");
  assert.ok(plan.master.every((range) => range.end <= 19 || range.start >= 24));
  assert.ok(plan.highlight.every((range) => range.end <= 19 || range.start >= 24));
});

test("chooseMimeType uses first browser-supported codec", () => {
  assert.equal(chooseMimeType((value) => value.includes("vp8")), "video/webm;codecs=vp8,opus");
  assert.equal(chooseMimeType(() => false), "");
});

test("qualityPreset returns defensive copy and correct dimensions", () => {
  const preset = qualityPreset("720p");
  assert.deepEqual([preset.width, preset.height, preset.fps], [1280, 720, 30]);
  preset.width = 1;
  assert.equal(qualityPreset("720p").width, 1280);
});

test("containRect letterboxes portrait source inside 16:9 target", () => {
  const rect = containRect(1080, 1920, 1600, 900);
  assert.equal(rect.height, 900);
  assert.ok(rect.x > 500);
});

test("mapClientPoint maps responsive canvas to 1600x900 coordinates", () => {
  assert.deepEqual(
    mapClientPoint(500, 275, { left: 100, top: 50, width: 800, height: 450 }),
    { x: 800, y: 450 }
  );
});

test("chunkRanges creates inclusive Content-Range boundaries", () => {
  assert.deepEqual(chunkRanges(10, 4), [{ start: 0, endExclusive: 10, endInclusive: 9, total: 10 }]);
  const ranges = chunkRanges(700000, 262144);
  assert.equal(ranges.length, 3);
  assert.equal(ranges.at(-1).endInclusive, 699999);
});

test("retry status policy covers throttling and server errors", () => {
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(503), true);
  assert.equal(isRetryableStatus(400), false);
});

test("formatDuration supports long lessons", () => {
  assert.equal(formatDuration(65), "01:05");
  assert.equal(formatDuration(3661), "01:01:01");
});

test("formatBytes produces readable values", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1.00 KB");
});

test("manifest copies session markers and recording metadata", () => {
  const session = createSession("Test", 1000, () => 0);
  session.markers.push(createMarker("chapter", 3, "", 1001));
  const manifest = buildManifest(session, {
    duration: 12.5,
    chunkCount: 3,
    size: 2048,
    scene: { items: [] }
  });
  assert.equal(manifest.recording.chunkCount, 3);
  assert.equal(manifest.session.markers.length, 1);
  assert.equal(manifest.scene.schemaVersion, 1);
});

test("worker argument parser rejects unknown flags", () => {
  assert.deepEqual(
    parseArguments(["--input", "a.webm", "--plan", "p.json", "--out", "out"]),
    { input: "a.webm", plan: "p.json", out: "out" }
  );
  assert.throws(() => parseArguments(["--bad"]), /không hỗ trợ/);
});

test("worker validates segment ordering and duration", () => {
  assert.deepEqual(validateSegments([{ start: 1, end: 2.55555 }], 3), [{ start: 1, end: 2.556 }]);
  assert.throws(() => validateSegments([{ start: 3, end: 2 }], 4), /không hợp lệ/);
});

test("ffmpeg arguments never use shell interpolation", () => {
  const argumentsList = ffmpegSegmentArgs({
    input: "a file.webm",
    output: "out.mp4",
    start: 1,
    end: 4
  });
  assert.equal(argumentsList.includes("a file.webm"), true);
  assert.equal(argumentsList.some((value) => /[|;&]/.test(value)), false);
});

test("concat list escapes apostrophes", () => {
  assert.match(concatListContent(["/tmp/sam's-file.mp4"]), /sam'\\''s-file/);
});
