#!/usr/bin/env node
import { mkdir, readFile, writeFile, rm, copyFile, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

export function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") result.input = argv[++index];
    else if (argument === "--plan") result.plan = argv[++index];
    else if (argument === "--out") result.out = argv[++index];
    else if (argument === "--ffmpeg") result.ffmpeg = argv[++index];
    else if (argument === "--help" || argument === "-h") result.help = true;
    else throw new Error(`Đối số không hỗ trợ: ${argument}`);
  }
  return result;
}

export function validateSegments(segments, duration = Infinity) {
  if (!Array.isArray(segments)) throw new Error("Danh sách segment phải là mảng");
  return segments.map((segment, index) => {
    const start = Number(segment.start);
    const end = Number(segment.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      throw new Error(`Segment ${index} không hợp lệ`);
    }
    if (Number.isFinite(duration) && end > duration + 0.25) {
      throw new Error(`Segment ${index} vượt quá thời lượng video`);
    }
    return { start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) };
  });
}

export function ffmpegSegmentArgs({ input, output, start, end }) {
  return [
    "-hide_banner", "-loglevel", "warning", "-y",
    "-ss", String(start), "-to", String(end), "-i", input,
    "-map", "0:v:0", "-map", "0:a?",
    "-c:v", "libx264", "-preset", "fast", "-crf", "20",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
    output
  ];
}

export function concatListContent(files) {
  return files.map((file) => `file '${String(file).replaceAll("'", "'\\''")}'`).join("\n") + "\n";
}

function run(command, argumentsList, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsList, {
      cwd,
      stdio: ["ignore", "inherit", "inherit"],
      shell: false
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} kết thúc với mã ${code}`));
    });
  });
}

async function renderSegments({ ffmpeg, input, segments, output, temporaryDirectory, prefix }) {
  if (!segments.length) return null;
  const parts = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const part = path.join(temporaryDirectory, `${prefix}-${String(index).padStart(4, "0")}.mp4`);
    await run(ffmpeg, ffmpegSegmentArgs({ input, output: part, start: segment.start, end: segment.end }));
    parts.push(part);
  }
  if (parts.length === 1) {
    await copyFile(parts[0], output);
    return output;
  }
  const listPath = path.join(temporaryDirectory, `${prefix}-concat.txt`);
  await writeFile(listPath, concatListContent(parts), "utf8");
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "warning", "-y",
    "-f", "concat", "-safe", "0", "-i", listPath,
    "-c", "copy", "-movflags", "+faststart", output
  ]);
  return output;
}

export async function renderSession({ input, planPath, outputDirectory, ffmpeg = "ffmpeg" }) {
  if (!input || !existsSync(input)) throw new Error(`Không tìm thấy video đầu vào: ${input || "(trống)"}`);
  if (!planPath || !existsSync(planPath)) throw new Error(`Không tìm thấy render plan: ${planPath || "(trống)"}`);
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const duration = Number(plan.duration) || Infinity;
  const masterSegments = validateSegments(plan.master, duration);
  const highlightSegments = validateSegments(plan.highlight || [], duration);
  if (!masterSegments.length) throw new Error("Render plan không còn segment master sau khi cắt lỗi");

  const output = path.resolve(outputDirectory || "render-output");
  await mkdir(output, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "sam-teaching-render-"));
  const startedAt = new Date();
  const report = {
    schemaVersion: 1,
    sessionId: plan.sessionId || "unknown",
    input: path.resolve(input),
    plan: path.resolve(planPath),
    startedAt: startedAt.toISOString(),
    master: null,
    highlight: null,
    segments: { master: masterSegments, highlight: highlightSegments },
    status: "processing"
  };

  try {
    report.master = await renderSegments({
      ffmpeg,
      input: path.resolve(input),
      segments: masterSegments,
      output: path.join(output, "lesson-master.mp4"),
      temporaryDirectory,
      prefix: "master"
    });
    if (highlightSegments.length) {
      report.highlight = await renderSegments({
        ffmpeg,
        input: path.resolve(input),
        segments: highlightSegments,
        output: path.join(output, "lesson-highlight.mp4"),
        temporaryDirectory,
        prefix: "highlight"
      });
    }
    report.status = "completed";
    report.completedAt = new Date().toISOString();
    report.elapsedSeconds = Number(((new Date(report.completedAt) - startedAt) / 1000).toFixed(3));
    await writeFile(path.join(output, "render-report.json"), JSON.stringify(report, null, 2), "utf8");
    return report;
  } catch (error) {
    report.status = "failed";
    report.completedAt = new Date().toISOString();
    report.error = error.message;
    await writeFile(path.join(output, "render-report.json"), JSON.stringify(report, null, 2), "utf8").catch(() => {});
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function usage() {
  return `Sam Teaching Visual Render Worker\n\nUsage:\n  node worker/render-worker.mjs --input recording.webm --plan render-plan.json --out render-output\n\nOutputs:\n  lesson-master.mp4\n  lesson-highlight.mp4 (khi có marker)\n  render-report.json\n`;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    const args = parseArguments(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      process.exit(0);
    }
    const report = await renderSession({
      input: args.input,
      planPath: args.plan,
      outputDirectory: args.out,
      ffmpeg: args.ffmpeg || "ffmpeg"
    });
    console.log(JSON.stringify({ status: report.status, master: report.master, highlight: report.highlight }, null, 2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(1);
  }
}
